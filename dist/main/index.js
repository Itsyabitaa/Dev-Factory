"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_updater_1 = require("electron-updater");
const commandRunner_1 = require("./core/commandRunner");
const projectService_1 = require("./core/projectService");
const hostService_1 = require("./core/hostService");
const portService_1 = require("./core/portService");
const serverService_1 = require("./core/serverService");
const proxyService_1 = require("./core/proxyService");
const logService_1 = require("./core/logService");
const child_process_1 = require("child_process");
let mainWindow = null;
const runner = new commandRunner_1.CommandRunner();
const logService = new logService_1.LogService();
const projectService = new projectService_1.ProjectService(runner);
const hostService = new hostService_1.HostService();
const portService = new portService_1.PortService();
let serverService = null;
let proxyService = null;
process.on("uncaughtException", (err) => {
    logService.error("uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason, p) => {
    logService.error("unhandledRejection", { reason: String(reason) });
});
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path_1.default.join(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        logService.error("renderer process gone", details);
    });
    serverService = new serverService_1.ServerService(runner, projectService, portService, hostService, {
        sendStatus: (projectId, status) => mainWindow?.webContents.send("server:status", { projectId, status }),
        sendLog: (projectId, data, type) => mainWindow?.webContents.send("server:log", { projectId, data, type }),
    });
    proxyService = new proxyService_1.ProxyService((status, error) => {
        logService.logProxy(status, error);
        mainWindow?.webContents.send("proxy:status", { status, error });
    });
    mainWindow.loadFile(path_1.default.join(__dirname, "../../src/renderer/index.html"));
}
function setupAutoUpdate() {
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on("update-available", (info) => {
        logService.info("update available", { version: info.version });
        mainWindow?.webContents.send("app:update-available", { version: info.version });
    });
    electron_updater_1.autoUpdater.on("update-downloaded", () => {
        logService.info("update downloaded");
        mainWindow?.webContents.send("app:update-downloaded", {});
        electron_1.dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Update ready",
            message: "A new version has been downloaded. Restart the app to install.",
            buttons: ["Restart now", "Later"],
            defaultId: 0,
        }).then(({ response }) => {
            if (response === 0)
                electron_updater_1.autoUpdater.quitAndInstall(false, true);
        });
    });
    electron_updater_1.autoUpdater.on("error", (err) => logService.error("updater error", { message: err.message }));
    electron_updater_1.autoUpdater.checkForUpdates().catch((err) => logService.error("checkForUpdates", { message: err instanceof Error ? err.message : String(err) }));
}
electron_1.app.whenReady().then(() => {
    logService.info("app ready");
    createWindow();
    setupAutoUpdate();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on("before-quit", () => {
    logService.info("app quitting – stopping servers and proxy");
    runner.cancelAll();
    proxyService?.stopProxy();
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
// IPC Handlers
electron_1.ipcMain.handle("cmd:run", async (_event, { jobId, command, args, options }) => {
    try {
        const result = await runner.run(jobId, command, args, options, {
            onStdout: (data) => {
                mainWindow?.webContents.send("cmd:log", { jobId, data, type: "stdout" });
            },
            onStderr: (data) => {
                mainWindow?.webContents.send("cmd:log", { jobId, data, type: "stderr" });
            },
        });
        return { success: true, result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
electron_1.ipcMain.on("cmd:cancel", (_event, jobId) => {
    runner.cancel(jobId);
});
// Sprint 3 Handlers
electron_1.ipcMain.handle("project:select-dir", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
    });
    return result.filePaths[0];
});
electron_1.ipcMain.handle("project:check-deps", async () => {
    return await projectService.checkDependencies();
});
electron_1.ipcMain.handle("project:create", async (_event, payload) => {
    return await projectService.createProject(payload, (step, data, type) => {
        mainWindow?.webContents.send("project:progress", { step, data, type });
    });
});
/** Ensure Next.js config has output: 'export' so build produces ./out for Apache. */
function ensureNextStaticExport(projectPath) {
    const names = ["next.config.mjs", "next.config.js", "next.config.ts"];
    for (const name of names) {
        const filePath = path_1.default.join(projectPath, name);
        if (!fs_1.default.existsSync(filePath))
            continue;
        let content = fs_1.default.readFileSync(filePath, "utf8");
        if (/output\s*:\s*['"]export['"]/.test(content))
            return;
        // Match: const nextConfig = { | const nextConfig: NextConfig = { | module.exports = { | export default {
        const replacement = content.replace(/(const nextConfig\s*(?::\s*\w+\s*)?=\s*\{|module\.exports\s*=\s*\{|export default\s*\{)/, "$1\n  output: 'export',");
        if (replacement !== content) {
            fs_1.default.writeFileSync(filePath, replacement);
        }
        return;
    }
}
electron_1.ipcMain.handle("project:build", async (_event, payload) => {
    const projectPath = typeof payload === "string" ? payload : payload.projectPath;
    const framework = typeof payload === "string" ? undefined : payload.framework;
    try {
        if (framework === "next")
            ensureNextStaticExport(projectPath);
        const result = await runner.run(`build_${Date.now()}`, "npm", ["run", "build"], { cwd: projectPath }, {
            onStdout: (data) => mainWindow?.webContents.send("project:progress", { step: "Building for production...", data, type: "stdout" }),
            onStderr: (data) => mainWindow?.webContents.send("project:progress", { step: "Building for production...", data, type: "stderr" }),
        });
        return { success: result.code === 0, code: result.code };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
electron_1.ipcMain.handle("project:open-folder", async (_event, folderPath) => {
    electron_1.shell.openPath(folderPath);
});
electron_1.ipcMain.handle("project:open-code", async (_event, folderPath) => {
    // Try to open with code. We use exec because shell.openPath doesn't support arguments.
    const cmd = process.platform === "win32" ? "code.cmd" : "code";
    (0, child_process_1.exec)(`${cmd} "${folderPath}"`, (err) => {
        if (err)
            console.error("Failed to open VS Code:", err);
    });
});
// Sprint 4 Handlers
electron_1.ipcMain.handle("host:add", async (_event, { domain, projectId, documentRoot }) => {
    return await hostService.addDomain(domain, projectId, "127.0.0.1", documentRoot);
});
electron_1.ipcMain.handle("host:remove", async (_event, domain) => {
    return await hostService.removeDomain(domain);
});
electron_1.ipcMain.handle("host:is-mapped", async (_event, domain) => {
    return await hostService.isDomainMapped(domain);
});
/** Resolve document root for static hosting; e.g. Angular may use dist/name or dist/name/browser. */
electron_1.ipcMain.handle("project:document-root", async (_event, payload) => {
    const { projectPath, framework, name } = payload;
    if (framework === "laravel")
        return path_1.default.join(projectPath, "public");
    if (framework === "next")
        return path_1.default.join(projectPath, "out");
    if (framework === "angular") {
        const withBrowser = path_1.default.join(projectPath, "dist", name, "browser");
        const withoutBrowser = path_1.default.join(projectPath, "dist", name);
        return fs_1.default.existsSync(withBrowser) ? withBrowser : withoutBrowser;
    }
    return path_1.default.join(projectPath, "dist");
});
// Sprint 5: Project list + Dev server control (Sprint 6: enrich with domain for proxy)
electron_1.ipcMain.handle("project:list", async () => {
    const projects = projectService.getProjects();
    return projects.map((p) => ({ ...p, domain: hostService.getDomainForProject(p.name) }));
});
electron_1.ipcMain.handle("project:get", async (_event, fullPath) => {
    const p = projectService.getProject(fullPath);
    if (!p)
        return null;
    return { ...p, domain: hostService.getDomainForProject(p.name) };
});
electron_1.ipcMain.handle("server:start", async (_event, projectId) => {
    const res = await (serverService?.startProject(projectId) ?? { success: false, error: "Server service not ready." });
    if (res.success && proxyService?.getProxyStatus() === "Running") {
        const projects = projectService.getProjects();
        const project = projects.find((p) => p.fullPath === projectId);
        const domain = project ? hostService.getDomainForProject(project.name) : null;
        const port = portService.getStoredPort(projectId);
        if (domain && port != null) {
            proxyService.ensureRoute(domain, `http://127.0.0.1:${port}`);
        }
    }
    return res;
});
electron_1.ipcMain.handle("server:stop", async (_event, projectId) => {
    const projects = projectService.getProjects();
    const project = projects.find((p) => p.fullPath === projectId);
    const domain = project ? hostService.getDomainForProject(project.name) : null;
    if (domain && proxyService)
        proxyService.removeRoute(domain);
    return serverService?.stopProject(projectId) ?? { success: true };
});
electron_1.ipcMain.handle("server:restart", async (_event, projectId) => {
    return serverService?.restartProject(projectId) ?? { success: false, error: "Server service not ready." };
});
electron_1.ipcMain.handle("server:status", async (_event, projectId) => {
    return serverService?.getStatus(projectId) ?? "Stopped";
});
electron_1.ipcMain.handle("server:url", async (_event, projectId) => {
    return serverService?.getUrl(projectId) ?? null;
});
electron_1.ipcMain.handle("server:open-url", async (_event, url) => {
    if (url)
        electron_1.shell.openExternal(url);
});
electron_1.ipcMain.handle("server:check-runtime-deps", async (_event, payload) => {
    if (!serverService)
        return { ok: false, error: "Server service not ready." };
    return serverService.checkRuntimeDeps(payload.projectPath, payload.framework);
});
electron_1.ipcMain.handle("project:install", async (_event, projectPath) => {
    const { getNodeInstallCommand, detectNodePackageManager } = await Promise.resolve().then(() => __importStar(require("./core/packageManager")));
    const { detectFramework } = await Promise.resolve().then(() => __importStar(require("./core/frameworkDetector")));
    const framework = detectFramework(projectPath);
    let cmd = "npm";
    let args = ["install"];
    if (framework === "laravel") {
        cmd = "composer";
        args = ["install"];
    }
    else {
        const pm = detectNodePackageManager(projectPath);
        const install = getNodeInstallCommand(pm);
        cmd = install.cmd;
        args = install.args;
    }
    try {
        const result = await runner.run(`install_${Date.now()}`, cmd, args, { cwd: projectPath }, {
            onStdout: (data) => mainWindow?.webContents.send("project:progress", { step: "Installing dependencies...", data, type: "stdout" }),
            onStderr: (data) => mainWindow?.webContents.send("project:progress", { step: "Installing dependencies...", data, type: "stderr" }),
        });
        return { success: result.code === 0, error: result.code !== 0 ? `${cmd} install failed` : undefined };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
electron_1.ipcMain.handle("project:import", async () => {
    const folder = await electron_1.dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
    if (!folder.canceled && folder.filePaths[0]) {
        return projectService.importProject(folder.filePaths[0]);
    }
    return { success: false, error: "No folder selected." };
});
electron_1.ipcMain.handle("project:update", async (_event, payload) => {
    return projectService.updateProject(payload.projectId, payload.updates);
});
electron_1.ipcMain.handle("project:detect-framework", async (_event, folderPath) => {
    const { detectFramework } = await Promise.resolve().then(() => __importStar(require("./core/frameworkDetector")));
    return detectFramework(folderPath);
});
electron_1.ipcMain.handle("project:detect-package-manager", async (_event, folderPath) => {
    const { detectNodePackageManager } = await Promise.resolve().then(() => __importStar(require("./core/packageManager")));
    return detectNodePackageManager(folderPath);
});
electron_1.ipcMain.handle("project:git-init", async (_event, projectPath) => {
    try {
        const result = await runner.run(`git_init_${Date.now()}`, "git", ["init"], { cwd: projectPath }, {
            onStdout: (data) => mainWindow?.webContents.send("project:progress", { step: "Git init", data, type: "stdout" }),
            onStderr: (data) => mainWindow?.webContents.send("project:progress", { step: "Git init", data, type: "stderr" }),
        });
        return { success: result.code === 0, error: result.code !== 0 ? "git init failed" : undefined };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
electron_1.ipcMain.handle("presets:list", async () => {
    const { PRESETS } = await Promise.resolve().then(() => __importStar(require("./core/presets")));
    return PRESETS;
});
electron_1.ipcMain.handle("presets:for-framework", async (_event, framework) => {
    const { getPresetsForFramework } = await Promise.resolve().then(() => __importStar(require("./core/presets")));
    return getPresetsForFramework(framework);
});
// Sprint 6: Proxy (real domains without ports)
electron_1.ipcMain.handle("proxy:start", async () => {
    const res = await (proxyService?.startProxy() ?? { success: false, error: "Proxy service not ready." });
    if (res.success && proxyService && serverService) {
        for (const p of projectService.getProjects()) {
            if (serverService.getStatus(p.fullPath) === "Running") {
                const domain = hostService.getDomainForProject(p.name);
                const port = portService.getStoredPort(p.fullPath);
                if (domain && port != null)
                    proxyService.ensureRoute(domain, `http://127.0.0.1:${port}`);
            }
        }
    }
    return res;
});
electron_1.ipcMain.handle("proxy:stop", async () => {
    return proxyService?.stopProxy() ?? { success: true };
});
electron_1.ipcMain.handle("proxy:status", async () => {
    const status = proxyService?.getProxyStatus() ?? "Stopped";
    const error = proxyService?.getStatusError() ?? null;
    return { status, error };
});
electron_1.ipcMain.handle("proxy:port", async () => proxyService?.getProxyPort() ?? 8080);
electron_1.ipcMain.handle("proxy:domain-url", async (_event, domain) => {
    return domain ? proxyService?.getProxyUrl(domain) ?? null : null;
});
electron_1.ipcMain.handle("proxy:repair", async () => {
    if (!proxyService || !serverService)
        return { success: false, error: "Services not ready." };
    if (proxyService.getProxyStatus() !== "Running")
        return { success: true, message: "Proxy not running; start it first." };
    const routes = proxyService.getRoutes();
    for (const domain of Object.keys(routes)) {
        proxyService.removeRoute(domain);
    }
    for (const p of projectService.getProjects()) {
        if (serverService.getStatus(p.fullPath) === "Running") {
            const domain = hostService.getDomainForProject(p.name);
            const port = portService.getStoredPort(p.fullPath);
            if (domain && port != null)
                proxyService.ensureRoute(domain, `http://127.0.0.1:${port}`);
        }
    }
    return { success: true };
});
// Sprint 7: Project delete, logs, app paths
electron_1.ipcMain.handle("project:delete", async (_event, projectId) => {
    const projects = projectService.getProjects();
    const project = projects.find((p) => p.fullPath === projectId);
    if (!project)
        return { success: false, error: "Project not found." };
    const domain = hostService.getDomainForProject(project.name);
    if (serverService?.getStatus(projectId) === "Running" || serverService?.getStatus(projectId) === "Starting") {
        await serverService.stopProject(projectId);
    }
    if (domain && proxyService)
        proxyService.removeRoute(domain);
    if (domain)
        await hostService.removeDomain(domain);
    const ok = projectService.deleteProject(projectId);
    if (ok)
        logService.info("project deleted", { projectId, domain });
    return { success: ok };
});
electron_1.ipcMain.handle("logs:export", async () => {
    return logService.getExportContent();
});
electron_1.ipcMain.handle("logs:dir", async () => {
    return logService.getLogsDir();
});
electron_1.ipcMain.handle("logs:export-to-file", async () => {
    const content = logService.getExportContent();
    const { filePath } = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath: `devfactory-logs-${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (filePath) {
        fs_1.default.writeFileSync(filePath, content);
        return { success: true, path: filePath };
    }
    return { success: false };
});
electron_1.ipcMain.handle("app:user-data-path", async () => {
    return electron_1.app.getPath("userData");
});
electron_1.ipcMain.handle("app:check-for-updates", async () => {
    if (!electron_1.app.isPackaged)
        return { success: false, error: "Updates only in packaged app" };
    try {
        const result = await electron_updater_1.autoUpdater.checkForUpdates();
        return { success: true, update: result?.updateInfo ? { version: result.updateInfo.version } : null };
    }
    catch (e) {
        return { success: false, error: e?.message || "Check failed" };
    }
});
