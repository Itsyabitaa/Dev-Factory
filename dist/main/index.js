"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const commandRunner_1 = require("./core/commandRunner");
const projectService_1 = require("./core/projectService");
const hostService_1 = require("./core/hostService");
const portService_1 = require("./core/portService");
const serverService_1 = require("./core/serverService");
const child_process_1 = require("child_process");
let mainWindow = null;
const runner = new commandRunner_1.CommandRunner();
const projectService = new projectService_1.ProjectService(runner);
const hostService = new hostService_1.HostService();
const portService = new portService_1.PortService();
let serverService = null;
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
    serverService = new serverService_1.ServerService(runner, projectService, portService, hostService, {
        sendStatus: (projectId, status) => mainWindow?.webContents.send("server:status", { projectId, status }),
        sendLog: (projectId, data, type) => mainWindow?.webContents.send("server:log", { projectId, data, type }),
    });
    mainWindow.loadFile(path_1.default.join(__dirname, "../../src/renderer/index.html"));
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
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
// Sprint 5: Project list + Dev server control
electron_1.ipcMain.handle("project:list", async () => {
    return projectService.getProjects();
});
electron_1.ipcMain.handle("server:start", async (_event, projectId) => {
    return serverService?.startProject(projectId) ?? { success: false, error: "Server service not ready." };
});
electron_1.ipcMain.handle("server:stop", async (_event, projectId) => {
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
    try {
        const result = await runner.run(`install_${Date.now()}`, "npm", ["install"], { cwd: projectPath }, {});
        return { success: result.code === 0, error: result.code !== 0 ? "npm install failed" : undefined };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
