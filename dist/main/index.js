import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { CommandRunner } from "./core/commandRunner.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow = null;
const runner = new CommandRunner();
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            // Disable sandbox so ES module preload can use `import` syntax
            sandbox: false,
        },
    });
    mainWindow.loadFile(path.join(__dirname, "../../src/renderer/index.html"));
}
app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
// IPC Handlers
ipcMain.handle("cmd:run", async (_event, { jobId, command, args, options }) => {
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
ipcMain.on("cmd:cancel", (_event, jobId) => {
    runner.cancel(jobId);
});
