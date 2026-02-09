import fs from "fs";
import path from "path";
import { app } from "electron";
import { CommandRunner, RunResult } from "./commandRunner";
import { detectFramework as detectFrameworkFromPath } from "./frameworkDetector";
import { getPreset } from "./presets";

export type Framework = "laravel" | "react" | "next" | "angular";

export interface RunProfile {
    port?: number;
    startCommand?: string;
    env?: Record<string, string>;
}

export interface ProjectOptions {
    installDeps: boolean;
    initGit: boolean;
}

export interface ProjectPayload {
    framework: Framework;
    name: string;
    path: string;
    options: ProjectOptions;
    presetId?: string;
}

export interface DependencyStatus {
    tool: string;
    installed: boolean;
    version?: string;
    error?: string;
}

export class ProjectService {
    private runner: CommandRunner;
    private manifestPath: string;

    constructor(runner: CommandRunner) {
        this.runner = runner;
        this.manifestPath = path.join(app.getPath("userData"), "projects.json");
    }

    async checkDependencies(): Promise<DependencyStatus[]> {
        const tools = [
            { id: "node", cmd: "node", args: ["-v"] },
            { id: "npm", cmd: "npm", args: ["-v"] },
            { id: "php", cmd: "php", args: ["-v"] },
            { id: "composer", cmd: "composer", args: ["-V"] },
            { id: "git", cmd: "git", args: ["--version"] },
        ];

        const results: DependencyStatus[] = [];

        for (const tool of tools) {
            try {
                const res = await this.runner.run(`check_${tool.id}`, tool.cmd, tool.args);
                results.push({
                    tool: tool.id,
                    installed: res.code === 0,
                    version: res.code === 0 ? "Installed" : undefined,
                });
            } catch (error: any) {
                results.push({
                    tool: tool.id,
                    installed: false,
                    error: error.message,
                });
            }
        }

        return results;
    }

    async createProject(
        payload: ProjectPayload,
        onProgress: (step: string, data: string, type: "stdout" | "stderr" | "step") => void
    ): Promise<{ success: boolean; error?: string }> {
        const { framework, name, path: projectPath, options } = payload;

        // 1. Validation
        if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
            return { success: false, error: "Invalid project name. Use only letters, numbers, hyphens, and underscores." };
        }

        if (fs.existsSync(path.join(projectPath, name))) {
            return { success: false, error: "Target directory already exists." };
        }

        const steps: { name: string; cmd: string; args: string[]; cwd?: string }[] = [];

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
                const preset = payload.presetId ? getPreset(payload.presetId) : undefined;
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
                        cwd: path.join(projectPath, name),
                    });
                }
                const reactCwd = path.join(projectPath, name);
                (preset?.postSteps || []).forEach((s) => steps.push({ name: `Running: ${s.cmd} ${s.args.join(" ")}`, cmd: s.cmd, args: s.args, cwd: reactCwd }));
                break;
            }
            case "next":
                steps.push({
                    name: "Scaffolding Next.js project...",
                    cmd: "npx",
                    args: ["create-next-app@latest", name, "--yes", ...(payload.presetId ? getPreset(payload.presetId)?.scaffoldExtra || [] : [])],
                    cwd: projectPath,
                });
                if (options.installDeps) {
                    steps.push({
                        name: "Installing dependencies...",
                        cmd: "npm",
                        args: ["install"],
                        cwd: path.join(projectPath, name),
                    });
                }
                break;
            case "angular": {
                const preset = payload.presetId ? getPreset(payload.presetId) : undefined;
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
                        cwd: path.join(projectPath, name),
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
                cwd: path.join(projectPath, name),
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
            } catch (error: any) {
                return { success: false, error: `Step failed: ${step.name}. ${error.message}` };
            }
        }

        // 4. Save Manifest
        this.saveManifest(payload);

        return { success: true };
    }

    getProjects(): Array<{ name: string; framework: Framework; path: string; fullPath: string; createdAt: string; port?: number; runProfile?: RunProfile; packageManager?: string; lastOpenedAt?: string; imported?: boolean }> {
        if (!fs.existsSync(this.manifestPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
        } catch {
            return [];
        }
    }

    getProject(fullPath: string): { name: string; framework: Framework; path: string; fullPath: string; createdAt: string; port?: number; runProfile?: RunProfile; packageManager?: string; lastOpenedAt?: string } | null {
        const projects = this.getProjects();
        const p = projects.find((x) => x.fullPath === fullPath);
        return p ?? null;
    }

    importProject(fullPath: string): { success: boolean; error?: string; framework?: Framework } {
        const normalized = path.normalize(fullPath);
        const name = path.basename(normalized);
        const parentPath = path.dirname(normalized);
        const framework = detectFrameworkFromPath(normalized);
        if (!framework) {
            return { success: false, error: "Could not detect framework (Laravel, React, Next, or Angular)." };
        }
        let projects: any[] = [];
        if (fs.existsSync(this.manifestPath)) {
            try {
                projects = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
            } catch (e) {
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
        if (!fs.existsSync(path.dirname(this.manifestPath))) {
            fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        }
        fs.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
        return { success: true, framework };
    }

    updateProject(fullPath: string, updates: Partial<{ runProfile: RunProfile; packageManager: string; lastOpenedAt: string }>): boolean {
        if (!fs.existsSync(this.manifestPath)) return false;
        try {
            const projects = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
            const idx = projects.findIndex((p: any) => p.fullPath === fullPath);
            if (idx < 0) return false;
            if (updates.runProfile !== undefined) projects[idx].runProfile = updates.runProfile;
            if (updates.packageManager !== undefined) projects[idx].packageManager = updates.packageManager;
            if (updates.lastOpenedAt !== undefined) projects[idx].lastOpenedAt = updates.lastOpenedAt;
            fs.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
            return true;
        } catch {
            return false;
        }
    }

    deleteProject(fullPath: string): boolean {
        if (!fs.existsSync(this.manifestPath)) return false;
        try {
            let projects = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
            const before = projects.length;
            projects = projects.filter((p: { fullPath: string }) => p.fullPath !== fullPath);
            if (projects.length === before) return false;
            fs.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
            return true;
        } catch {
            return false;
        }
    }

    private saveManifest(payload: ProjectPayload) {
        let projects = [];
        if (fs.existsSync(this.manifestPath)) {
            try {
                projects = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
            } catch (e) {
                projects = [];
            }
        }

        projects.push({
            ...payload,
            createdAt: new Date().toISOString(),
            fullPath: path.join(payload.path, payload.name),
        });

        if (!fs.existsSync(path.dirname(this.manifestPath))) {
            fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        }
        fs.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
    }
}
