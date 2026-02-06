import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent, shell, dialog } from "electron";
import path from "path";
import { CommandRunner } from "./core/commandRunner";
import { ProjectService, ProjectPayload } from "./core/projectService";
import { exec } from "child_process";

let mainWindow: BrowserWindow | null = null;
const runner = new CommandRunner();
const projectService = new ProjectService(runner);

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
