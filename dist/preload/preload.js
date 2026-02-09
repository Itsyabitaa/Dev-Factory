"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    runCommand: (jobId, command, args, options) => electron_1.ipcRenderer.invoke("cmd:run", { jobId, command, args, options }),
    cancelCommand: (jobId) => electron_1.ipcRenderer.send("cmd:cancel", jobId),
    onCommandLog: (callback) => electron_1.ipcRenderer.on("cmd:log", (_event, value) => callback(value)),
    // Sprint 3
    selectDir: () => electron_1.ipcRenderer.invoke("project:select-dir"),
    checkDeps: () => electron_1.ipcRenderer.invoke("project:check-deps"),
    createProject: (payload) => electron_1.ipcRenderer.invoke("project:create", payload),
    buildProject: (projectPath, framework) => electron_1.ipcRenderer.invoke("project:build", { projectPath, framework }),
    openFolder: (path) => electron_1.ipcRenderer.invoke("project:open-folder", path),
    openCode: (path) => electron_1.ipcRenderer.invoke("project:open-code", path),
    onProjectProgress: (callback) => electron_1.ipcRenderer.on("project:progress", (_event, value) => callback(value)),
    // Sprint 4
    getDocumentRoot: (projectPath, framework, name) => electron_1.ipcRenderer.invoke("project:document-root", { projectPath, framework, name }),
    addDomain: (domain, projectId, documentRoot) => electron_1.ipcRenderer.invoke("host:add", { domain, projectId, documentRoot }),
    removeDomain: (domain) => electron_1.ipcRenderer.invoke("host:remove", domain),
    isDomainMapped: (domain) => electron_1.ipcRenderer.invoke("host:is-mapped", domain),
});
