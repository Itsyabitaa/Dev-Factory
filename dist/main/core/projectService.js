"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const frameworkDetector_1 = require("./frameworkDetector");
const presets_1 = require("./presets");
class ProjectService {
    runner;
    manifestPath;
    constructor(runner) {
        this.runner = runner;
        this.manifestPath = path_1.default.join(electron_1.app.getPath("userData"), "projects.json");
    }
    async checkDependencies() {
        const tools = [
            { id: "node", cmd: "node", args: ["-v"] },
            { id: "npm", cmd: "npm", args: ["-v"] },
            { id: "php", cmd: "php", args: ["-v"] },
            { id: "composer", cmd: "composer", args: ["-V"] },
            { id: "git", cmd: "git", args: ["--version"] },
        ];
        const results = [];
        for (const tool of tools) {
            try {
                const res = await this.runner.run(`check_${tool.id}`, tool.cmd, tool.args);
                results.push({
                    tool: tool.id,
                    installed: res.code === 0,
                    version: res.code === 0 ? "Installed" : undefined,
                });
            }
            catch (error) {
                results.push({
                    tool: tool.id,
                    installed: false,
                    error: error.message,
                });
            }
        }
        return results;
    }
    async createProject(payload, onProgress) {
        const { framework, name, path: projectPath, options } = payload;
        // 1. Validation
        if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
            return { success: false, error: "Invalid project name. Use only letters, numbers, hyphens, and underscores." };
        }
        if (fs_1.default.existsSync(path_1.default.join(projectPath, name))) {
            return { success: false, error: "Target directory already exists." };
        }
        const steps = [];
        // 2. Build Plan
        switch (framework) {
            case "laravel":
                steps.push({
                    name: "Scaffolding Laravel project...",
                    cmd: "composer",
                    args: ["create-project", "laravel/laravel", name],
                    cwd: projectPath,
                });
                break;
            case "react": {
                const preset = payload.presetId ? (0, presets_1.getPreset)(payload.presetId) : undefined;
                const template = preset?.scaffoldExtra?.[0] ?? "react";
                steps.push({
                    name: "Scaffolding Vite/React project...",
                    cmd: "npm",
                    args: ["create", "vite@latest", name, "--", "--template", template],
                    cwd: projectPath,
                });
                if (options.installDeps) {
                    steps.push({
                        name: "Installing dependencies...",
                        cmd: "npm",
                        args: ["install"],
                        cwd: path_1.default.join(projectPath, name),
                    });
                }
                const reactCwd = path_1.default.join(projectPath, name);
                (preset?.postSteps || []).forEach((s) => steps.push({ name: `Running: ${s.cmd} ${s.args.join(" ")}`, cmd: s.cmd, args: s.args, cwd: reactCwd }));
                break;
            }
            case "next":
                steps.push({
                    name: "Scaffolding Next.js project...",
                    cmd: "npx",
                    args: ["create-next-app@latest", name, "--yes", ...(payload.presetId ? (0, presets_1.getPreset)(payload.presetId)?.scaffoldExtra || [] : [])],
                    cwd: projectPath,
                });
                if (options.installDeps) {
                    steps.push({
                        name: "Installing dependencies...",
                        cmd: "npm",
                        args: ["install"],
                        cwd: path_1.default.join(projectPath, name),
                    });
                }
                break;
            case "angular": {
                const preset = payload.presetId ? (0, presets_1.getPreset)(payload.presetId) : undefined;
                const ngArgs = ["-p", "@angular/cli", "ng", "new", name, "--defaults", ...(preset?.scaffoldExtra || [])];
                steps.push({
                    name: "Scaffolding Angular project...",
                    cmd: "npx",
                    args: ngArgs,
                    cwd: projectPath,
                });
                if (options.installDeps) {
                    steps.push({
                        name: "Installing dependencies...",
                        cmd: "npm",
                        args: ["install"],
                        cwd: path_1.default.join(projectPath, name),
                    });
                }
                break;
            }
        }
        if (options.initGit) {
            steps.push({
                name: "Initializing Git repository...",
                cmd: "git",
                args: ["init"],
                cwd: path_1.default.join(projectPath, name),
            });
        }
        // 3. Execute Plan
        for (const step of steps) {
            onProgress(step.name, "", "step");
            try {
                await this.runner.run(`create_${Date.now()}`, step.cmd, step.args, { cwd: step.cwd }, {
                    onStdout: (data) => onProgress(step.name, data, "stdout"),
                    onStderr: (data) => onProgress(step.name, data, "stderr"),
                });
            }
            catch (error) {
                return { success: false, error: `Step failed: ${step.name}. ${error.message}` };
            }
        }
        // 4. Save Manifest
        this.saveManifest(payload);
        return { success: true };
    }
    getProjects() {
        if (!fs_1.default.existsSync(this.manifestPath))
            return [];
        try {
            return JSON.parse(fs_1.default.readFileSync(this.manifestPath, "utf8"));
        }
        catch {
            return [];
        }
    }
    getProject(fullPath) {
        const projects = this.getProjects();
        const p = projects.find((x) => x.fullPath === fullPath);
        return p ?? null;
    }
    importProject(fullPath) {
        const normalized = path_1.default.normalize(fullPath);
        const name = path_1.default.basename(normalized);
        const parentPath = path_1.default.dirname(normalized);
        const framework = (0, frameworkDetector_1.detectFramework)(normalized);
        if (!framework) {
            return { success: false, error: "Could not detect framework (Laravel, React, Next, or Angular)." };
        }
        let projects = [];
        if (fs_1.default.existsSync(this.manifestPath)) {
            try {
                projects = JSON.parse(fs_1.default.readFileSync(this.manifestPath, "utf8"));
            }
            catch (e) {
                projects = [];
            }
        }
        if (projects.some((p) => p.fullPath === normalized)) {
            return { success: false, error: "Project already in list." };
        }
        projects.push({
            name,
            framework,
            path: parentPath,
            fullPath: normalized,
            createdAt: new Date().toISOString(),
            imported: true,
        });
        if (!fs_1.default.existsSync(path_1.default.dirname(this.manifestPath))) {
            fs_1.default.mkdirSync(path_1.default.dirname(this.manifestPath), { recursive: true });
        }
        fs_1.default.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
        return { success: true, framework };
    }
    updateProject(fullPath, updates) {
        if (!fs_1.default.existsSync(this.manifestPath))
            return false;
        try {
            const projects = JSON.parse(fs_1.default.readFileSync(this.manifestPath, "utf8"));
            const idx = projects.findIndex((p) => p.fullPath === fullPath);
            if (idx < 0)
                return false;
            if (updates.runProfile !== undefined)
                projects[idx].runProfile = updates.runProfile;
            if (updates.packageManager !== undefined)
                projects[idx].packageManager = updates.packageManager;
            if (updates.lastOpenedAt !== undefined)
                projects[idx].lastOpenedAt = updates.lastOpenedAt;
            fs_1.default.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
            return true;
        }
        catch {
            return false;
        }
    }
    deleteProject(fullPath) {
        if (!fs_1.default.existsSync(this.manifestPath))
            return false;
        try {
            let projects = JSON.parse(fs_1.default.readFileSync(this.manifestPath, "utf8"));
            const before = projects.length;
            projects = projects.filter((p) => p.fullPath !== fullPath);
            if (projects.length === before)
                return false;
            fs_1.default.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
            return true;
        }
        catch {
            return false;
        }
    }
    saveManifest(payload) {
        let projects = [];
        if (fs_1.default.existsSync(this.manifestPath)) {
            try {
                projects = JSON.parse(fs_1.default.readFileSync(this.manifestPath, "utf8"));
            }
            catch (e) {
                projects = [];
            }
        }
        projects.push({
            ...payload,
            createdAt: new Date().toISOString(),
            fullPath: path_1.default.join(payload.path, payload.name),
        });
        if (!fs_1.default.existsSync(path_1.default.dirname(this.manifestPath))) {
            fs_1.default.mkdirSync(path_1.default.dirname(this.manifestPath), { recursive: true });
        }
        fs_1.default.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
    }
}
exports.ProjectService = ProjectService;
