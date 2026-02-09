import fs from "fs";
import path from "path";
import { app } from "electron";
import { CommandRunner, RunResult } from "./commandRunner";

export type Framework = "laravel" | "react" | "next" | "angular";

export interface ProjectOptions {
    installDeps: boolean;
    initGit: boolean;
}

export interface ProjectPayload {
    framework: Framework;
    name: string;
    path: string;
    options: ProjectOptions;
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
            case "react":
                steps.push({
                    name: "Scaffolding Vite/React project...",
                    cmd: "npm",
                    args: ["create", "vite@latest", name, "--", "--template", "react"],
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
            case "next":
                steps.push({
                    name: "Scaffolding Next.js project...",
                    cmd: "npx",
                    args: ["create-next-app@latest", name, "--yes"],
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
            case "angular":
                steps.push({
                    name: "Scaffolding Angular project...",
                    cmd: "npx",
                    args: ["-p", "@angular/cli", "ng", "new", name, "--defaults"],
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
