"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyService = void 0;
exports.getCaddyPath = getCaddyPath;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const net_1 = __importDefault(require("net"));
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const PROXY_PORT = 8080;
const CADDY_JOB_ID = "caddy_proxy";
/** Windows: accept caddy.exe or caddy_windows_amd64.exe etc. Other platforms: caddy. */
function getCaddyBinaryCandidates() {
    if (os_1.default.platform() === "win32") {
        return ["caddy.exe", "caddy_windows_amd64.exe", "caddy_windows_arm64.exe"];
    }
    return ["caddy"];
}
/** Resolve Caddy binary path: userData/bin first, then resources (packaged app). */
function getCaddyPath() {
    const binDir = path_1.default.join(electron_1.app.getPath("userData"), "bin");
    for (const name of getCaddyBinaryCandidates()) {
        const candidate = path_1.default.join(binDir, name);
        if (fs_1.default.existsSync(candidate))
            return candidate;
    }
    // Packaged app: electron-builder can put binaries in resources
    const resourcesPath = process.resourcesPath;
    if (resourcesPath) {
        const resourcesCaddy = path_1.default.join(resourcesPath, "caddy");
        for (const name of getCaddyBinaryCandidates()) {
            const candidate = path_1.default.join(resourcesCaddy, name);
            if (fs_1.default.existsSync(candidate))
                return candidate;
        }
    }
    return null;
}
class ProxyService {
    routes = new Map(); // domain -> targetUrl (e.g. http://127.0.0.1:5173)
    configPath;
    status = "Stopped";
    statusError = null;
    child = null;
    onStatusChange;
    constructor(onStatusChange) {
        this.configPath = path_1.default.join(electron_1.app.getPath("userData"), "proxy", "Caddyfile");
        this.onStatusChange = onStatusChange;
    }
    getProxyStatus() {
        return this.status;
    }
    getStatusError() {
        return this.statusError;
    }
    getProxyPort() {
        return PROXY_PORT;
    }
    /** Get URL for a domain through the proxy (e.g. http://a.test:8080). */
    getProxyUrl(domain) {
        return `http://${domain}:${PROXY_PORT}`;
    }
    setStatus(status, error) {
        this.status = status;
        this.statusError = error ?? null;
        this.onStatusChange(status, error);
    }
    writeConfig() {
        const dir = path_1.default.dirname(this.configPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        const lines = [
            `# DevFactory proxy - do not edit manually`,
            `# Port ${PROXY_PORT} (no admin required)`,
            "",
        ];
        for (const [domain, targetUrl] of this.routes) {
            lines.push(`${domain}:${PROXY_PORT} {`);
            lines.push(`    reverse_proxy ${targetUrl}`);
            lines.push("}");
            lines.push("");
        }
        if (this.routes.size === 0) {
            lines.push(`:${PROXY_PORT} {`);
            lines.push(`    respond "No project routes. Start a project and ensure proxy is running." 200`);
            lines.push("}");
        }
        fs_1.default.writeFileSync(this.configPath, lines.join("\n"));
    }
    isPortFree(port) {
        return new Promise((resolve) => {
            const server = net_1.default.createServer(() => { });
            server.once("error", () => resolve(false));
            server.once("listening", () => {
                server.close(() => resolve(true));
            });
            server.listen(port, "127.0.0.1");
        });
    }
    startProxy() {
        if (this.child) {
            return Promise.resolve({ success: true });
        }
        const caddyPath = getCaddyPath();
        if (!caddyPath) {
            const binDir = path_1.default.join(electron_1.app.getPath("userData"), "bin");
            this.setStatus("Error", "Caddy binary not found. Place caddy.exe or caddy_windows_amd64.exe in: " + binDir + " (see https://caddyserver.com/download)");
            return Promise.resolve({
                success: false,
                error: "Caddy binary not found. Place caddy.exe or caddy_windows_amd64.exe in " + binDir + " (see https://caddyserver.com/download)",
            });
        }
        return this.isPortFree(PROXY_PORT).then((free) => {
            if (!free) {
                this.setStatus("Error", `Port ${PROXY_PORT} is already in use. Stop the other service or change the proxy port.`);
                return {
                    success: false,
                    error: `Port ${PROXY_PORT} is already in use. Another service may be running.`,
                };
            }
            this.writeConfig();
            const useShell = os_1.default.platform() === "win32" && caddyPath.toLowerCase().endsWith(".exe");
            const child = (0, child_process_1.spawn)(caddyPath, ["run", "--config", this.configPath], {
                shell: useShell,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
            });
            this.child = child;
            this.setStatus("Running");
            if (child.stdout)
                child.stdout.setEncoding("utf8");
            if (child.stderr) {
                child.stderr.setEncoding("utf8");
                child.stderr.on("data", (chunk) => {
                    if (chunk.includes("error") || chunk.includes("Error")) {
                        this.setStatus("Error", chunk.slice(0, 200));
                    }
                });
            }
            child.on("error", (err) => {
                this.setStatus("Error", err.message);
                this.child = null;
            });
            child.on("exit", (code) => {
                this.child = null;
                if (code !== 0 && code !== null) {
                    this.setStatus("Error", `Caddy exited with code ${code}`);
                }
                else {
                    this.setStatus("Stopped");
                }
            });
            return { success: true };
        });
    }
    stopProxy() {
        if (!this.child) {
            return Promise.resolve({ success: true });
        }
        try {
            if (os_1.default.platform() === "win32") {
                (0, child_process_1.spawn)("taskkill", ["/PID", String(this.child.pid), "/T", "/F"], { shell: true, windowsHide: true });
            }
            else {
                this.child.kill("SIGTERM");
            }
            this.child = null;
            this.setStatus("Stopped");
            return Promise.resolve({ success: true });
        }
        catch (e) {
            return Promise.resolve({ success: false, error: e.message });
        }
    }
    ensureRoute(domain, targetUrl) {
        this.routes.set(domain, targetUrl);
        this.writeConfig();
        this.reloadConfig();
    }
    removeRoute(domain) {
        this.routes.delete(domain);
        this.writeConfig();
        this.reloadConfig();
    }
    reloadConfig() {
        if (!this.child || this.status !== "Running")
            return;
        const caddyPath = getCaddyPath();
        if (!caddyPath)
            return;
        const useShell = os_1.default.platform() === "win32" && caddyPath.toLowerCase().endsWith(".exe");
        const reloadProc = (0, child_process_1.spawn)(caddyPath, ["reload", "--config", this.configPath], {
            shell: useShell,
            windowsHide: true,
        });
        reloadProc.on("error", () => { });
    }
    /** Return current routes (for UI/debug). */
    getRoutes() {
        return Object.fromEntries(this.routes);
    }
}
exports.ProxyService = ProxyService;
