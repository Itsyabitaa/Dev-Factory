import path from "path";
import fs from "fs";
import os from "os";
import { CommandRunner } from "./commandRunner";
import { ProjectService } from "./projectService";
import { PortService } from "./portService";
import { HostService } from "./hostService";
import { detectNodePackageManager, getNodeInstallCommand, getNodeRunDevArgs } from "./packageManager";
import type { Framework } from "./projectService";

export type ServerStatus = "Stopped" | "Starting" | "Running" | "Error";

interface RunningEntry {
    jobId: string;
    pid?: number;
    port: number;
    startedAt: string;
    status: ServerStatus;
}

function getDefaultStartCommand(framework: Framework, fullPath: string, port: number): { cmd: string; args: string[]; useShell?: boolean } {
    const nodeManager = detectNodePackageManager(fullPath);
    switch (framework) {
        case "laravel":
            return { cmd: "php", args: ["artisan", "serve", "--host", "127.0.0.1", "--port", String(port)] };
        case "react":
            return { cmd: nodeManager === "pnpm" ? "pnpm" : nodeManager === "yarn" ? "yarn" : "npm", args: getNodeRunDevArgs(nodeManager, port) };
        case "next":
            return {
                cmd: nodeManager === "pnpm" ? "pnpm" : nodeManager === "yarn" ? "yarn" : "npm",
                args: nodeManager === "pnpm" ? ["run", "dev", "--", "-p", String(port)] : nodeManager === "yarn" ? ["run", "dev", "-p", String(port)] : ["run", "dev", "--", "-p", String(port)],
            };
        case "angular":
            return { cmd: "npx", args: ["ng", "serve", "--host", "127.0.0.1", "--port", String(port)] };
    }
}

export interface ServerServiceOptions {
    sendStatus: (projectId: string, status: ServerStatus) => void;
    sendLog: (projectId: string, data: string, type: "stdout" | "stderr") => void;
}

export class ServerService {
    private runner: CommandRunner;
    private projectService: ProjectService;
    private portService: PortService;
    private hostService: HostService;
    private sendStatus: (projectId: string, status: ServerStatus) => void;
    private sendLog: (projectId: string, data: string, type: "stdout" | "stderr") => void;
    private registry = new Map<string, RunningEntry>();

    constructor(
        runner: CommandRunner,
        projectService: ProjectService,
        portService: PortService,
        hostService: HostService,
        options: ServerServiceOptions
    ) {
        this.runner = runner;
        this.projectService = projectService;
        this.portService = portService;
        this.hostService = hostService;
        this.sendStatus = options.sendStatus;
        this.sendLog = options.sendLog;
    }

    getStatus(projectId: string): ServerStatus {
        const entry = this.registry.get(projectId);
        if (entry) return entry.status;
        if (this.runner.hasJob(this.jobIdFor(projectId))) return "Starting";
        return "Stopped";
    }

    getUrl(projectId: string): string | null {
        const entry = this.registry.get(projectId);
        const port = entry?.port ?? this.portService.getStoredPort(projectId);
        if (port == null) return null;
        const domain = this.hostService.getDomainForProject(this.projectNameFor(projectId));
        const host = domain ?? "localhost";
        return `http://${host}:${port}`;
    }

    private jobIdFor(projectId: string): string {
        return `server_${projectId.replace(/[^a-zA-Z0-9-_]/g, "_")}`;
    }

    private projectNameFor(fullPath: string): string {
        const projects = this.projectService.getProjects();
        const p = projects.find((x) => x.fullPath === fullPath);
        return p?.name ?? path.basename(fullPath);
    }

    async checkRuntimeDeps(fullPath: string, framework: Framework): Promise<{ ok: boolean; error?: string }> {
        if (framework === "laravel") {
            try {
                await this.runner.run(`check_php_${Date.now()}`, "php", ["-v"]);
                return { ok: true };
            } catch (e: any) {
                return { ok: false, error: "PHP is not installed or not in PATH." };
            }
        }
        try {
            await this.runner.run(`check_node_${Date.now()}`, "node", ["-v"]);
        } catch (e: any) {
            return { ok: false, error: "Node.js is not installed or not in PATH." };
        }
        const nodeModules = path.join(fullPath, "node_modules");
        if (!fs.existsSync(nodeModules)) {
            return { ok: false, error: "Dependencies not installed. Run Install first." };
        }
        return { ok: true };
    }

    async startProject(projectId: string): Promise<{ success: boolean; error?: string }> {
        const projects = this.projectService.getProjects();
        const project = projects.find((p) => p.fullPath === projectId);
        if (!project) {
            return { success: false, error: "Project not found in manifest." };
        }

        const jobId = this.jobIdFor(projectId);
        if (this.runner.hasJob(jobId)) {
            return { success: true };
        }

        const depCheck = await this.checkRuntimeDeps(projectId, project.framework);
        if (!depCheck.ok) {
            return { success: false, error: depCheck.error };
        }

        let port: number;
        try {
            port = await this.portService.getPortForProject(projectId, project.runProfile?.port);
        } catch (e: any) {
            return { success: false, error: e.message };
        }

        this.registry.set(projectId, {
            jobId,
            port,
            startedAt: new Date().toISOString(),
            status: "Starting",
        });
        this.sendStatus(projectId, "Starting");

        const env = project.runProfile?.env ? { ...process.env, ...project.runProfile.env } : undefined;
        let runPromise: Promise<any>;

        if (project.runProfile?.startCommand) {
            const cmdStr = project.runProfile.startCommand.replace(/\{\{port\}\}/g, String(port));
            runPromise = this.runner.runShell(jobId, cmdStr, { cwd: projectId, env }, {
                onStdout: (data) => this.sendLog(projectId, data, "stdout"),
                onStderr: (data) => this.sendLog(projectId, data, "stderr"),
            });
        } else {
            const spec = getDefaultStartCommand(project.framework, projectId, port);
            runPromise = this.runner.run(jobId, spec.cmd, spec.args, { cwd: projectId, env }, {
                onStdout: (data) => this.sendLog(projectId, data, "stdout"),
                onStderr: (data) => this.sendLog(projectId, data, "stderr"),
            });
        }

        const entry = this.registry.get(projectId);
        if (entry) {
            const pid = this.runner.getPid(jobId);
            entry.pid = pid;
            entry.status = "Running";
            this.sendStatus(projectId, "Running");
        }

        runPromise
            .then((result) => {
                this.registry.delete(projectId);
                const status: ServerStatus = result.code === 0 ? "Stopped" : "Error";
                this.sendStatus(projectId, status);
            })
            .catch(() => {
                this.registry.delete(projectId);
                this.sendStatus(projectId, "Error");
            });

        return { success: true };
    }

    stopProject(projectId: string): Promise<{ success: boolean; error?: string }> {
        const jobId = this.jobIdFor(projectId);
        if (!this.runner.hasJob(jobId)) {
            return Promise.resolve({ success: true });
        }
        try {
            this.runner.cancel(jobId);
            this.registry.delete(projectId);
            this.sendStatus(projectId, "Stopped");
            return Promise.resolve({ success: true });
        } catch (e: any) {
            return Promise.resolve({ success: false, error: e.message });
        }
    }

    async restartProject(projectId: string): Promise<{ success: boolean; error?: string }> {
        await this.stopProject(projectId);
        return this.startProject(projectId);
    }
}
