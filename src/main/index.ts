import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent, shell, dialog } from "electron";
import path from "path";
import fs from "fs";
import { CommandRunner } from "./core/commandRunner";
import { ProjectService, ProjectPayload } from "./core/projectService";
import { HostService } from "./core/hostService";
import { exec } from "child_process";

let mainWindow: BrowserWindow | null = null;
const runner = new CommandRunner();
const projectService = new ProjectService(runner);
const hostService = new HostService();

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

    mainWindow.loadFile(path.join(__dirname, "../../src/renderer/index.html"));
}

app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
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
