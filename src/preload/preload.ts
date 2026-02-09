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
    buildProject: (projectPath: string, framework?: string) => ipcRenderer.invoke("project:build", { projectPath, framework }),
    openFolder: (path: string) => ipcRenderer.invoke("project:open-folder", path),
    openCode: (path: string) => ipcRenderer.invoke("project:open-code", path),
    onProjectProgress: (callback: (data: any) => void) =>
        ipcRenderer.on("project:progress", (_event, value) => callback(value)),

    // Sprint 4
    getDocumentRoot: (projectPath: string, framework: string, name: string) =>
        ipcRenderer.invoke("project:document-root", { projectPath, framework, name }),
    addDomain: (domain: string, projectId: string, documentRoot?: string) => ipcRenderer.invoke("host:add", { domain, projectId, documentRoot }),
    removeDomain: (domain: string) => ipcRenderer.invoke("host:remove", domain),
    isDomainMapped: (domain: string) => ipcRenderer.invoke("host:is-mapped", domain),
});
