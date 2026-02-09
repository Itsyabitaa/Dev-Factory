"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerService = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const DEV_COMMANDS = {
    laravel: {
        cmd: "php",
        args: (port) => ["artisan", "serve", "--host", "127.0.0.1", "--port", String(port)],
    },
    react: {
        cmd: "npm",
        args: (port) => ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)],
    },
    next: {
        cmd: "npm",
        args: (port) => ["run", "dev", "--", "-p", String(port)],
    },
    angular: {
        cmd: "npx",
        args: (port) => ["ng", "serve", "--host", "127.0.0.1", "--port", String(port)],
    },
};
class ServerService {
    runner;
    projectService;
    portService;
    hostService;
    sendStatus;
    sendLog;
    registry = new Map();
    constructor(runner, projectService, portService, hostService, options) {
        this.runner = runner;
        this.projectService = projectService;
        this.portService = portService;
        this.hostService = hostService;
        this.sendStatus = options.sendStatus;
        this.sendLog = options.sendLog;
    }
    getStatus(projectId) {
        const entry = this.registry.get(projectId);
        if (entry)
            return entry.status;
        if (this.runner.hasJob(this.jobIdFor(projectId)))
            return "Starting";
        return "Stopped";
    }
    getUrl(projectId) {
        const entry = this.registry.get(projectId);
        const port = entry?.port ?? this.portService.getStoredPort(projectId);
        if (port == null)
            return null;
        const domain = this.hostService.getDomainForProject(this.projectNameFor(projectId));
        const host = domain ?? "localhost";
        return `http://${host}:${port}`;
    }
    jobIdFor(projectId) {
        return `server_${projectId.replace(/[^a-zA-Z0-9-_]/g, "_")}`;
    }
    projectNameFor(fullPath) {
        const projects = this.projectService.getProjects();
        const p = projects.find((x) => x.fullPath === fullPath);
        return p?.name ?? path_1.default.basename(fullPath);
    }
    async checkRuntimeDeps(fullPath, framework) {
        if (framework === "laravel") {
            try {
                await this.runner.run(`check_php_${Date.now()}`, "php", ["-v"]);
                return { ok: true };
            }
            catch (e) {
                return { ok: false, error: "PHP is not installed or not in PATH." };
            }
        }
        try {
            await this.runner.run(`check_node_${Date.now()}`, "node", ["-v"]);
        }
        catch (e) {
            return { ok: false, error: "Node.js is not installed or not in PATH." };
        }
        const nodeModules = path_1.default.join(fullPath, "node_modules");
        if (!fs_1.default.existsSync(nodeModules)) {
            return { ok: false, error: "Dependencies not installed. Run Install first." };
        }
        return { ok: true };
    }
    async startProject(projectId) {
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
        let port;
        try {
            port = await this.portService.getPortForProject(projectId);
        }
        catch (e) {
            return { success: false, error: e.message };
        }
        this.registry.set(projectId, {
            jobId,
            port,
            startedAt: new Date().toISOString(),
            status: "Starting",
        });
        this.sendStatus(projectId, "Starting");
        const spec = DEV_COMMANDS[project.framework];
        const args = spec.args(port);
        const runPromise = this.runner.run(jobId, spec.cmd, args, { cwd: projectId }, {
            onStdout: (data) => this.sendLog(projectId, data, "stdout"),
            onStderr: (data) => this.sendLog(projectId, data, "stderr"),
        });
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
            const status = result.code === 0 ? "Stopped" : "Error";
            this.sendStatus(projectId, status);
        })
            .catch(() => {
            this.registry.delete(projectId);
            this.sendStatus(projectId, "Error");
        });
        return { success: true };
    }
    stopProject(projectId) {
        const jobId = this.jobIdFor(projectId);
        if (!this.runner.hasJob(jobId)) {
            return Promise.resolve({ success: true });
        }
        try {
            this.runner.cancel(jobId);
            this.registry.delete(projectId);
            this.sendStatus(projectId, "Stopped");
            return Promise.resolve({ success: true });
        }
        catch (e) {
            return Promise.resolve({ success: false, error: e.message });
        }
    }
    async restartProject(projectId) {
        await this.stopProject(projectId);
        return this.startProject(projectId);
    }
}
exports.ServerService = ServerService;
