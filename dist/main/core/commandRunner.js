"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRunner = void 0;
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
class CommandRunner {
    jobs = new Map();
    resolveCommand(command) {
        if (os_1.default.platform() === "win32") {
            if (command === "npm")
                return "npm.cmd";
            if (command === "npx")
                return "npx.cmd";
            if (command === "composer")
                return "composer.bat";
        }
        return command;
    }
    shouldUseShell(command) {
        // On Windows, `.cmd` / `.bat` files are not directly executable via CreateProcess,
        // so we need to spawn them through the shell (cmd.exe).
        if (os_1.default.platform() !== "win32")
            return false;
        const lower = command.toLowerCase();
        return lower.endsWith(".cmd") || lower.endsWith(".bat");
    }
    run(jobId, command, args, options = {}, handlers = {}) {
        if (this.jobs.has(jobId))
            throw new Error(`Job already exists: ${jobId}`);
        const start = Date.now();
        const resolvedCommand = this.resolveCommand(command);
        const useShell = this.shouldUseShell(resolvedCommand);
        const child = (0, child_process_1.spawn)(resolvedCommand, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            shell: useShell,
            windowsHide: true,
        });
        this.jobs.set(jobId, child);
        if (child.stdout)
            child.stdout.setEncoding("utf8");
        if (child.stderr)
            child.stderr.setEncoding("utf8");
        child.stdout?.on("data", (chunk) => handlers.onStdout?.(chunk));
        child.stderr?.on("data", (chunk) => handlers.onStderr?.(chunk));
        let timeout;
        if (options.timeoutMs) {
            timeout = setTimeout(() => {
                this.cancel(jobId);
            }, options.timeoutMs);
        }
        return new Promise((resolve, reject) => {
            child.on("error", (err) => {
                this.jobs.delete(jobId);
                if (timeout)
                    clearTimeout(timeout);
                reject(err);
            });
            child.on("close", (code, signal) => {
                this.jobs.delete(jobId);
                if (timeout)
                    clearTimeout(timeout);
                resolve({ code, signal, durationMs: Date.now() - start });
            });
        });
    }
    /** Run a full shell command string (e.g. for custom run profiles). */
    runShell(jobId, command, options = {}, handlers = {}) {
        if (this.jobs.has(jobId))
            throw new Error(`Job already exists: ${jobId}`);
        const start = Date.now();
        const shell = os_1.default.platform() === "win32" ? "cmd.exe" : "/bin/sh";
        const args = os_1.default.platform() === "win32" ? ["/c", command] : ["-c", command];
        const child = (0, child_process_1.spawn)(shell, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            shell: false,
            windowsHide: true,
        });
        this.jobs.set(jobId, child);
        if (child.stdout)
            child.stdout.setEncoding("utf8");
        if (child.stderr)
            child.stderr.setEncoding("utf8");
        child.stdout?.on("data", (chunk) => handlers.onStdout?.(chunk));
        child.stderr?.on("data", (chunk) => handlers.onStderr?.(chunk));
        let timeout;
        if (options.timeoutMs) {
            timeout = setTimeout(() => this.cancel(jobId), options.timeoutMs);
        }
        return new Promise((resolve, reject) => {
            child.on("error", (err) => {
                this.jobs.delete(jobId);
                if (timeout)
                    clearTimeout(timeout);
                reject(err);
            });
            child.on("close", (code, signal) => {
                this.jobs.delete(jobId);
                if (timeout)
                    clearTimeout(timeout);
                resolve({ code, signal, durationMs: Date.now() - start });
            });
        });
    }
    cancel(jobId) {
        const child = this.jobs.get(jobId);
        if (!child)
            return;
        if (os_1.default.platform() === "win32") {
            // Most reliable way to kill a process tree on Windows
            (0, child_process_1.spawn)("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
                shell: true,
                windowsHide: true,
            });
        }
        else {
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 1500);
        }
        this.jobs.delete(jobId);
    }
    getPid(jobId) {
        const child = this.jobs.get(jobId);
        return child?.pid;
    }
    hasJob(jobId) {
        return this.jobs.has(jobId);
    }
    getAllJobIds() {
        return Array.from(this.jobs.keys());
    }
    cancelAll() {
        for (const jobId of this.getAllJobIds()) {
            this.cancel(jobId);
        }
    }
}
exports.CommandRunner = CommandRunner;
