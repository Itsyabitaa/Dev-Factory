import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent, shell, dialog } from "electron";
import path from "path";
import fs from "fs";
import { autoUpdater } from "electron-updater";
import { CommandRunner } from "./core/commandRunner";
import { ProjectService, ProjectPayload, Framework } from "./core/projectService";
import { HostService } from "./core/hostService";
import { PortService } from "./core/portService";
import { ServerService } from "./core/serverService";
import { ProxyService } from "./core/proxyService";
import { LogService } from "./core/logService";
import { exec } from "child_process";

let mainWindow: BrowserWindow | null = null;
const runner = new CommandRunner();
const logService = new LogService();
const projectService = new ProjectService(runner);
const hostService = new HostService();
const portService = new PortService();
let serverService: ServerService | null = null;
let proxyService: ProxyService | null = null;

process.on("uncaughtException", (err) => {
    logService.error("uncaughtException", { message: err.message, stack: err.stack });
});
process.on("unhandledRejection", (reason, p) => {
    logService.error("unhandledRejection", { reason: String(reason) });
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        logService.error("renderer process gone", details);
    });

    serverService = new ServerService(runner, projectService, portService, hostService, {
        sendStatus: (projectId, status) => mainWindow?.webContents.send("server:status", { projectId, status }),
        sendLog: (projectId, data, type) => mainWindow?.webContents.send("server:log", { projectId, data, type }),
    });

    proxyService = new ProxyService((status, error) => {
        logService.logProxy(status, error);
        mainWindow?.webContents.send("proxy:status", { status, error });
    });

    mainWindow.loadFile(path.join(__dirname, "../../src/renderer/index.html"));
}

function setupAutoUpdate(): void {
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("update-available", (info: { version: string }) => {
        logService.info("update available", { version: info.version });
        mainWindow?.webContents.send("app:update-available", { version: info.version });
    });
    autoUpdater.on("update-downloaded", () => {
        logService.info("update downloaded");
        mainWindow?.webContents.send("app:update-downloaded", {});
        dialog.showMessageBox(mainWindow!, {
            type: "info",
            title: "Update ready",
            message: "A new version has been downloaded. Restart the app to install.",
            buttons: ["Restart now", "Later"],
            defaultId: 0,
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall(false, true);
        });
    });
    autoUpdater.on("error", (err: Error) => logService.error("updater error", { message: err.message }));
    autoUpdater.checkForUpdates().catch((err: unknown) => logService.error("checkForUpdates", { message: err instanceof Error ? err.message : String(err) }));
}

app.whenReady().then(() => {
    logService.info("app ready");
    createWindow();
    setupAutoUpdate();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("before-quit", () => {
    logService.info("app quitting – stopping servers and proxy");
    runner.cancelAll();
    proxyService?.stopProxy();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

// IPC Handlers
ipcMain.handle("cmd:run", async (_event: IpcMainInvokeEvent, { jobId, command, args, options }: { jobId: string, command: string, args: string[], options: any }) => {
    try {
        const result = await runner.run(jobId, command, args, options, {
            onStdout: (data: string) => {
                mainWindow?.webContents.send("cmd:log", { jobId, data, type: "stdout" });
            },
            onStderr: (data: string) => {
                mainWindow?.webContents.send("cmd:log", { jobId, data, type: "stderr" });
            },
        });
        return { success: true, result };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

ipcMain.on("cmd:cancel", (_event: IpcMainEvent, jobId: string) => {
    runner.cancel(jobId);
});

// Sprint 3 Handlers
ipcMain.handle("project:select-dir", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ["openDirectory"],
    });
    return result.filePaths[0];
});
ipcMain.handle("project:check-deps", async () => {
    return await projectService.checkDependencies();
});

ipcMain.handle("project:create", async (_event: IpcMainInvokeEvent, payload: ProjectPayload) => {
    return await projectService.createProject(payload, (step, data, type) => {
        mainWindow?.webContents.send("project:progress", { step, data, type });
    });
});

/** Ensure Next.js config has output: 'export' so build produces ./out for Apache. */
function ensureNextStaticExport(projectPath: string): void {
    const names = ["next.config.mjs", "next.config.js", "next.config.ts"];
    for (const name of names) {
        const filePath = path.join(projectPath, name);
        if (!fs.existsSync(filePath)) continue;
        let content = fs.readFileSync(filePath, "utf8");
        if (/output\s*:\s*['"]export['"]/.test(content)) return;
        // Match: const nextConfig = { | const nextConfig: NextConfig = { | module.exports = { | export default {
        const replacement = content.replace(
            /(const nextConfig\s*(?::\s*\w+\s*)?=\s*\{|module\.exports\s*=\s*\{|export default\s*\{)/,
            "$1\n  output: 'export',"
        );
        if (replacement !== content) {
            fs.writeFileSync(filePath, replacement);
        }
        return;
    }
}

ipcMain.handle("project:build", async (_event: IpcMainInvokeEvent, payload: { projectPath: string; framework?: string }) => {
    const projectPath = typeof payload === "string" ? payload : payload.projectPath;
    const framework = typeof payload === "string" ? undefined : payload.framework;
    try {
        if (framework === "next") ensureNextStaticExport(projectPath);
        const result = await runner.run(
            `build_${Date.now()}`,
            "npm",
            ["run", "build"],
            { cwd: projectPath },
            {
                onStdout: (data: string) => mainWindow?.webContents.send("project:progress", { step: "Building for production...", data, type: "stdout" }),
                onStderr: (data: string) => mainWindow?.webContents.send("project:progress", { step: "Building for production...", data, type: "stderr" }),
            }
        );
        return { success: result.code === 0, code: result.code };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle("project:open-folder", async (_event, folderPath: string) => {
    shell.openPath(folderPath);
});

ipcMain.handle("project:open-code", async (_event, folderPath: string) => {
    // Try to open with code. We use exec because shell.openPath doesn't support arguments.
    const cmd = process.platform === "win32" ? "code.cmd" : "code";
    exec(`${cmd} "${folderPath}"`, (err) => {
        if (err) console.error("Failed to open VS Code:", err);
    });
});

// Sprint 4 Handlers
ipcMain.handle("host:add", async (_event, { domain, projectId, documentRoot }: { domain: string; projectId: string; documentRoot?: string }) => {
    return await hostService.addDomain(domain, projectId, "127.0.0.1", documentRoot);
});

ipcMain.handle("host:remove", async (_event, domain: string) => {
    return await hostService.removeDomain(domain);
});

ipcMain.handle("host:is-mapped", async (_event, domain: string) => {
    return await hostService.isDomainMapped(domain);
});

/** Resolve document root for static hosting; e.g. Angular may use dist/name or dist/name/browser. */
ipcMain.handle("project:document-root", async (_event, payload: { projectPath: string; framework: string; name: string }) => {
    const { projectPath, framework, name } = payload;
    if (framework === "laravel") return path.join(projectPath, "public");
    if (framework === "next") return path.join(projectPath, "out");
    if (framework === "angular") {
        const withBrowser = path.join(projectPath, "dist", name, "browser");
        const withoutBrowser = path.join(projectPath, "dist", name);
        return fs.existsSync(withBrowser) ? withBrowser : withoutBrowser;
    }
    return path.join(projectPath, "dist");
});

// Sprint 5: Project list + Dev server control (Sprint 6: enrich with domain for proxy)
ipcMain.handle("project:list", async () => {
    const projects = projectService.getProjects();
    return projects.map((p) => ({ ...p, domain: hostService.getDomainForProject(p.name) }));
});
ipcMain.handle("project:get", async (_event, fullPath: string) => {
    const p = projectService.getProject(fullPath);
    if (!p) return null;
    return { ...p, domain: hostService.getDomainForProject(p.name) };
});

ipcMain.handle("server:start", async (_event, projectId: string) => {
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
ipcMain.handle("server:stop", async (_event, projectId: string) => {
    const projects = projectService.getProjects();
    const project = projects.find((p) => p.fullPath === projectId);
    const domain = project ? hostService.getDomainForProject(project.name) : null;
    if (domain && proxyService) proxyService.removeRoute(domain);
    return serverService?.stopProject(projectId) ?? { success: true };
});
ipcMain.handle("server:restart", async (_event, projectId: string) => {
    return serverService?.restartProject(projectId) ?? { success: false, error: "Server service not ready." };
});
ipcMain.handle("server:status", async (_event, projectId: string) => {
    return serverService?.getStatus(projectId) ?? "Stopped";
});
ipcMain.handle("server:url", async (_event, projectId: string) => {
    return serverService?.getUrl(projectId) ?? null;
});
ipcMain.handle("server:open-url", async (_event, url: string) => {
    if (url) shell.openExternal(url);
});
ipcMain.handle("server:check-runtime-deps", async (_event, payload: { projectPath: string; framework: string }) => {
    if (!serverService) return { ok: false, error: "Server service not ready." };
    return serverService.checkRuntimeDeps(payload.projectPath, payload.framework as Framework);
});

ipcMain.handle("project:install", async (_event, projectPath: string) => {
    const { getNodeInstallCommand, detectNodePackageManager } = await import("./core/packageManager");
    const { detectFramework } = await import("./core/frameworkDetector");
    const framework = detectFramework(projectPath);
    let cmd = "npm";
    let args: string[] = ["install"];
    if (framework === "laravel") {
        cmd = "composer";
        args = ["install"];
    } else {
        const pm = detectNodePackageManager(projectPath);
        const install = getNodeInstallCommand(pm);
        cmd = install.cmd;
        args = install.args;
    }
    try {
        const result = await runner.run(
            `install_${Date.now()}`,
            cmd,
            args,
            { cwd: projectPath },
            {
                onStdout: (data) => mainWindow?.webContents.send("project:progress", { step: "Installing dependencies...", data, type: "stdout" }),
                onStderr: (data) => mainWindow?.webContents.send("project:progress", { step: "Installing dependencies...", data, type: "stderr" }),
            }
        );
        return { success: result.code === 0, error: result.code !== 0 ? `${cmd} install failed` : undefined };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle("project:import", async () => {
    const folder = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"] });
    if (!folder.canceled && folder.filePaths[0]) {
        return projectService.importProject(folder.filePaths[0]);
    }
    return { success: false, error: "No folder selected." };
});
ipcMain.handle("project:update", async (_event, payload: { projectId: string; updates: { runProfile?: { port?: number; startCommand?: string; env?: Record<string, string> }; packageManager?: string; lastOpenedAt?: string } }) => {
    return projectService.updateProject(payload.projectId, payload.updates);
});
ipcMain.handle("project:detect-framework", async (_event, folderPath: string) => {
    const { detectFramework } = await import("./core/frameworkDetector");
    return detectFramework(folderPath);
});
ipcMain.handle("project:detect-package-manager", async (_event, folderPath: string) => {
    const { detectNodePackageManager } = await import("./core/packageManager");
    return detectNodePackageManager(folderPath);
});
ipcMain.handle("project:git-init", async (_event, projectPath: string) => {
    try {
        const result = await runner.run(
            `git_init_${Date.now()}`,
            "git",
            ["init"],
            { cwd: projectPath },
            {
                onStdout: (data) => mainWindow?.webContents.send("project:progress", { step: "Git init", data, type: "stdout" }),
                onStderr: (data) => mainWindow?.webContents.send("project:progress", { step: "Git init", data, type: "stderr" }),
            }
        );
        return { success: result.code === 0, error: result.code !== 0 ? "git init failed" : undefined };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle("presets:list", async () => {
    const { PRESETS } = await import("./core/presets");
    return PRESETS;
});
ipcMain.handle("presets:for-framework", async (_event, framework: string) => {
    const { getPresetsForFramework } = await import("./core/presets");
    return getPresetsForFramework(framework as Framework);
});

// Sprint 6: Proxy (real domains without ports)
ipcMain.handle("proxy:start", async () => {
    const res = await (proxyService?.startProxy() ?? { success: false, error: "Proxy service not ready." });
    if (res.success && proxyService && serverService) {
        for (const p of projectService.getProjects()) {
            if (serverService.getStatus(p.fullPath) === "Running") {
                const domain = hostService.getDomainForProject(p.name);
                const port = portService.getStoredPort(p.fullPath);
                if (domain && port != null) proxyService.ensureRoute(domain, `http://127.0.0.1:${port}`);
            }
        }
    }
    return res;
});
ipcMain.handle("proxy:stop", async () => {
    return proxyService?.stopProxy() ?? { success: true };
});
ipcMain.handle("proxy:status", async () => {
    const status = proxyService?.getProxyStatus() ?? "Stopped";
    const error = proxyService?.getStatusError() ?? null;
    return { status, error };
});
ipcMain.handle("proxy:port", async () => proxyService?.getProxyPort() ?? 8080);
ipcMain.handle("proxy:domain-url", async (_event, domain: string) => {
    return domain ? proxyService?.getProxyUrl(domain) ?? null : null;
});
ipcMain.handle("proxy:repair", async () => {
    if (!proxyService || !serverService) return { success: false, error: "Services not ready." };
    if (proxyService.getProxyStatus() !== "Running") return { success: true, message: "Proxy not running; start it first." };
    const routes = proxyService.getRoutes();
    for (const domain of Object.keys(routes)) {
        proxyService.removeRoute(domain);
    }
    for (const p of projectService.getProjects()) {
        if (serverService.getStatus(p.fullPath) === "Running") {
            const domain = hostService.getDomainForProject(p.name);
            const port = portService.getStoredPort(p.fullPath);
            if (domain && port != null) proxyService.ensureRoute(domain, `http://127.0.0.1:${port}`);
        }
    }
    return { success: true };
});

// Sprint 7: Project delete, logs, app paths
ipcMain.handle("project:delete", async (_event, projectId: string) => {
    const projects = projectService.getProjects();
    const project = projects.find((p) => p.fullPath === projectId);
    if (!project) return { success: false, error: "Project not found." };
    const domain = hostService.getDomainForProject(project.name);
    if (serverService?.getStatus(projectId) === "Running" || serverService?.getStatus(projectId) === "Starting") {
        await serverService.stopProject(projectId);
    }
    if (domain && proxyService) proxyService.removeRoute(domain);
    if (domain) await hostService.removeDomain(domain);
    const ok = projectService.deleteProject(projectId);
    if (ok) logService.info("project deleted", { projectId, domain });
    return { success: ok };
});

ipcMain.handle("logs:export", async () => {
    return logService.getExportContent();
});
ipcMain.handle("logs:dir", async () => {
    return logService.getLogsDir();
});
ipcMain.handle("logs:export-to-file", async () => {
    const content = logService.getExportContent();
    const { filePath } = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: `devfactory-logs-${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (filePath) {
        fs.writeFileSync(filePath, content);
        return { success: true, path: filePath };
    }
    return { success: false };
});
ipcMain.handle("app:user-data-path", async () => {
    return app.getPath("userData");
});

ipcMain.handle("app:check-for-updates", async () => {
    if (!app.isPackaged) return { success: false, error: "Updates only in packaged app" };
    try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, update: result?.updateInfo ? { version: result.updateInfo.version } : null };
    } catch (e: any) {
        return { success: false, error: e?.message || "Check failed" };
    }
});
