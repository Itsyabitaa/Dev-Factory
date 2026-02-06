import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
    runCommand: (jobId: string, command: string, args: string[], options: any) =>
        ipcRenderer.invoke("cmd:run", { jobId, command, args, options }),
    cancelCommand: (jobId: string) => ipcRenderer.send("cmd:cancel", jobId),
    onCommandLog: (callback: (data: any) => void) =>
        ipcRenderer.on("cmd:log", (_event: IpcRendererEvent, value: any) => callback(value)),

    // Sprint 3
    selectDir: () => ipcRenderer.invoke("project:select-dir"),
    checkDeps: () => ipcRenderer.invoke("project:check-deps"),
    createProject: (payload: any) => ipcRenderer.invoke("project:create", payload),
    openFolder: (path: string) => ipcRenderer.invoke("project:open-folder", path),
    openCode: (path: string) => ipcRenderer.invoke("project:open-code", path),
    onProjectProgress: (callback: (data: any) => void) =>
        ipcRenderer.on("project:progress", (_event, value) => callback(value)),
});
