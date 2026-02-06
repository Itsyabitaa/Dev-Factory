import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
    runCommand: (jobId, command, args, options) => ipcRenderer.invoke("cmd:run", { jobId, command, args, options }),
    cancelCommand: (jobId) => ipcRenderer.send("cmd:cancel", jobId),
    onCommandLog: (callback) => ipcRenderer.on("cmd:log", (_event, value) => callback(value)),
});
