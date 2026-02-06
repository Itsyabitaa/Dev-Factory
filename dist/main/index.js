"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const commandRunner_1 = require("./core/commandRunner");
let mainWindow = null;
const runner = new commandRunner_1.CommandRunner();
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path_1.default.join(__dirname, "../preload/preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
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
