import path from "path";
import fs from "fs";
import os from "os";
import net from "net";
import { spawn, ChildProcess } from "child_process";
import { app } from "electron";

export type ProxyStatus = "Running" | "Stopped" | "Error";

const PROXY_PORT = 8080;
const CADDY_JOB_ID = "caddy_proxy";

/** Windows: accept caddy.exe or caddy_windows_amd64.exe etc. Other platforms: caddy. */
function getCaddyBinaryCandidates(): string[] {
    if (os.platform() === "win32") {
        return ["caddy.exe", "caddy_windows_amd64.exe", "caddy_windows_arm64.exe"];
    }
    return ["caddy"];
}

/** Resolve Caddy binary path: userData/bin first, then resources (packaged app). */
export function getCaddyPath(): string | null {
    const binDir = path.join(app.getPath("userData"), "bin");
    for (const name of getCaddyBinaryCandidates()) {
        const candidate = path.join(binDir, name);
        if (fs.existsSync(candidate)) return candidate;
    }
    // Packaged app: electron-builder can put binaries in resources
    const resourcesPath = process.resourcesPath;
    if (resourcesPath) {
        const resourcesCaddy = path.join(resourcesPath, "caddy");
        for (const name of getCaddyBinaryCandidates()) {
            const candidate = path.join(resourcesCaddy, name);
            if (fs.existsSync(candidate)) return candidate;
        }
    }
    return null;
}

export class ProxyService {
    private routes = new Map<string, string>(); // domain -> targetUrl (e.g. http://127.0.0.1:5173)
    private configPath: string;
    private status: ProxyStatus = "Stopped";
    private statusError: string | null = null;
    private child: ChildProcess | null = null;
    private onStatusChange: (status: ProxyStatus, error?: string) => void;

    constructor(onStatusChange: (status: ProxyStatus, error?: string) => void) {
        this.configPath = path.join(app.getPath("userData"), "proxy", "Caddyfile");
        this.onStatusChange = onStatusChange;
    }

    getProxyStatus(): ProxyStatus {
        return this.status;
    }

    getStatusError(): string | null {
        return this.statusError;
    }

    getProxyPort(): number {
        return PROXY_PORT;
    }

    /** Get URL for a domain through the proxy (e.g. http://a.test:8080). */
    getProxyUrl(domain: string): string {
        return `http://${domain}:${PROXY_PORT}`;
    }

    private setStatus(status: ProxyStatus, error?: string) {
        this.status = status;
        this.statusError = error ?? null;
        this.onStatusChange(status, error);
    }

    private writeConfig(): void {
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const lines: string[] = [
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
        fs.writeFileSync(this.configPath, lines.join("\n"));
    }

    private isPortFree(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer(() => {});
            server.once("error", () => resolve(false));
            server.once("listening", () => {
                server.close(() => resolve(true));
            });
            server.listen(port, "127.0.0.1");
        });
    }

    startProxy(): Promise<{ success: boolean; error?: string }> {
        if (this.child) {
            return Promise.resolve({ success: true });
        }

        const caddyPath = getCaddyPath();
        if (!caddyPath) {
            const binDir = path.join(app.getPath("userData"), "bin");
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
            const useShell = os.platform() === "win32" && caddyPath.toLowerCase().endsWith(".exe");
            const child = spawn(caddyPath, ["run", "--config", this.configPath], {
                shell: useShell,
                windowsHide: true,
                stdio: ["ignore", "pipe", "pipe"],
            });
            this.child = child;

            this.setStatus("Running");

            if (child.stdout) child.stdout.setEncoding("utf8");
            if (child.stderr) {
                child.stderr.setEncoding("utf8");
                child.stderr.on("data", (chunk: string) => {
                    if (chunk.includes("error") || chunk.includes("Error")) {
                        this.setStatus("Error", chunk.slice(0, 200));
                    }
                });
            }
            child.on("error", (err: Error) => {
                this.setStatus("Error", err.message);
                this.child = null;
            });
            child.on("exit", (code) => {
                this.child = null;
                if (code !== 0 && code !== null) {
                    this.setStatus("Error", `Caddy exited with code ${code}`);
                } else {
                    this.setStatus("Stopped");
                }
            });

            return { success: true };
        });
    }

    stopProxy(): Promise<{ success: boolean; error?: string }> {
        if (!this.child) {
            return Promise.resolve({ success: true });
        }
        try {
            if (os.platform() === "win32") {
                spawn("taskkill", ["/PID", String(this.child.pid), "/T", "/F"], { shell: true, windowsHide: true });
            } else {
                this.child.kill("SIGTERM");
            }
            this.child = null;
            this.setStatus("Stopped");
            return Promise.resolve({ success: true });
        } catch (e: any) {
            return Promise.resolve({ success: false, error: e.message });
        }
    }

    ensureRoute(domain: string, targetUrl: string): void {
        this.routes.set(domain, targetUrl);
        this.writeConfig();
        this.reloadConfig();
    }

    removeRoute(domain: string): void {
        this.routes.delete(domain);
        this.writeConfig();
        this.reloadConfig();
    }

    reloadConfig(): void {
        if (!this.child || this.status !== "Running") return;
        const caddyPath = getCaddyPath();
        if (!caddyPath) return;
        const useShell = os.platform() === "win32" && caddyPath.toLowerCase().endsWith(".exe");
        const reloadProc = spawn(caddyPath, ["reload", "--config", this.configPath], {
            shell: useShell,
            windowsHide: true,
        });
        reloadProc.on("error", () => {});
    }

    /** Return current routes (for UI/debug). */
    getRoutes(): Record<string, string> {
        return Object.fromEntries(this.routes);
    }
}
