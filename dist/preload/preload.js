"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    runCommand: (jobId, command, args, options) => electron_1.ipcRenderer.invoke("cmd:run", { jobId, command, args, options }),
    cancelCommand: (jobId) => electron_1.ipcRenderer.send("cmd:cancel", jobId),
    onCommandLog: (callback) => electron_1.ipcRenderer.on("cmd:log", (_event, value) => callback(value)),
});
