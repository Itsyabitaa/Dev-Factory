import { spawn } from "child_process";
import os from "os";
export class CommandRunner {
    jobs = new Map();
    resolveCommand(command) {
        if (os.platform() === "win32") {
            if (command === "npm")
                return "npm.cmd";
            if (command === "npx")
                return "npx.cmd";
            if (command === "composer")
                return "composer.bat";
        }
        return command;
    }
    run(jobId, command, args, options = {}, handlers = {}) {
        if (this.jobs.has(jobId))
            throw new Error(`Job already exists: ${jobId}`);
        const start = Date.now();
        const resolvedCommand = this.resolveCommand(command);
        // IMPORTANT: shell false is the key for cross-platform stability
        const child = spawn(resolvedCommand, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            shell: false,
            windowsHide: true,
        });
        this.jobs.set(jobId, child);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => handlers.onStdout?.(chunk));
        child.stderr.on("data", (chunk) => handlers.onStderr?.(chunk));
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
    cancel(jobId) {
        const child = this.jobs.get(jobId);
        if (!child)
            return;
        if (os.platform() === "win32") {
            // Most reliable way to kill a process tree on Windows
            spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
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
}
