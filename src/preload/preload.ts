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

    // Sprint 5 — Dev server control
    getProjectList: () => ipcRenderer.invoke("project:list"),
    serverStart: (projectId: string) => ipcRenderer.invoke("server:start", projectId),
    serverStop: (projectId: string) => ipcRenderer.invoke("server:stop", projectId),
    serverRestart: (projectId: string) => ipcRenderer.invoke("server:restart", projectId),
    serverStatus: (projectId: string) => ipcRenderer.invoke("server:status", projectId),
    serverUrl: (projectId: string) => ipcRenderer.invoke("server:url", projectId),
    serverOpenUrl: (url: string) => ipcRenderer.invoke("server:open-url", url),
    serverCheckRuntimeDeps: (projectPath: string, framework: string) =>
        ipcRenderer.invoke("server:check-runtime-deps", { projectPath, framework }),
    projectInstall: (projectPath: string) => ipcRenderer.invoke("project:install", projectPath),
    onServerStatus: (callback: (data: { projectId: string; status: string }) => void) =>
        ipcRenderer.on("server:status", (_event, value) => callback(value)),
    onServerLog: (callback: (data: { projectId: string; data: string; type: string }) => void) =>
        ipcRenderer.on("server:log", (_event, value) => callback(value)),

    // Sprint 6 — Proxy (real domains without ports)
    proxyStart: () => ipcRenderer.invoke("proxy:start"),
    proxyStop: () => ipcRenderer.invoke("proxy:stop"),
    proxyStatus: () => ipcRenderer.invoke("proxy:status"),
    proxyPort: () => ipcRenderer.invoke("proxy:port"),
    proxyDomainUrl: (domain: string) => ipcRenderer.invoke("proxy:domain-url", domain),
    onProxyStatus: (callback: (data: { status: string; error?: string }) => void) =>
        ipcRenderer.on("proxy:status", (_event, value) => callback(value)),

    // Sprint 7
    projectDelete: (projectId: string) => ipcRenderer.invoke("project:delete", projectId),
    proxyRepair: () => ipcRenderer.invoke("proxy:repair"),
    logsExport: () => ipcRenderer.invoke("logs:export"),
    logsExportToFile: () => ipcRenderer.invoke("logs:export-to-file"),
    logsDir: () => ipcRenderer.invoke("logs:dir"),
    appUserDataPath: () => ipcRenderer.invoke("app:user-data-path"),

    // Sprint 8
    projectImport: () => ipcRenderer.invoke("project:import"),
    projectUpdate: (projectId: string, updates: any) => ipcRenderer.invoke("project:update", { projectId, updates }),
    getProject: (fullPath: string) => ipcRenderer.invoke("project:get", fullPath),
    projectDetectFramework: (folderPath: string) => ipcRenderer.invoke("project:detect-framework", folderPath),
    projectDetectPackageManager: (folderPath: string) => ipcRenderer.invoke("project:detect-package-manager", folderPath),
    projectGitInit: (projectPath: string) => ipcRenderer.invoke("project:git-init", projectPath),
    presetsList: () => ipcRenderer.invoke("presets:list"),
    presetsForFramework: (framework: string) => ipcRenderer.invoke("presets:for-framework", framework),
});
