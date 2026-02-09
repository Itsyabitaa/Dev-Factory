import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import os from "os";

export type RunOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
};

export type RunResult = {
    code: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
};

type Handlers = {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
};

export class CommandRunner {
    private jobs = new Map<string, ChildProcessWithoutNullStreams>();

    private resolveCommand(command: string): string {
        if (os.platform() === "win32") {
            if (command === "npm") return "npm.cmd";
            if (command === "npx") return "npx.cmd";
            if (command === "composer") return "composer.bat";
        }
        return command;
    }

    private shouldUseShell(command: string): boolean {
        // On Windows, `.cmd` / `.bat` files are not directly executable via CreateProcess,
        // so we need to spawn them through the shell (cmd.exe).
        if (os.platform() !== "win32") return false;
        const lower = command.toLowerCase();
        return lower.endsWith(".cmd") || lower.endsWith(".bat");
    }

    run(
        jobId: string,
        command: string,
        args: string[],
        options: RunOptions = {},
        handlers: Handlers = {}
    ): Promise<RunResult> {
        if (this.jobs.has(jobId)) throw new Error(`Job already exists: ${jobId}`);

        const start = Date.now();
        const resolvedCommand = this.resolveCommand(command);

        const useShell = this.shouldUseShell(resolvedCommand);
        const child = spawn(resolvedCommand, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            shell: useShell,
            windowsHide: true,
        });

        this.jobs.set(jobId, child);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (chunk: string) => handlers.onStdout?.(chunk));
        child.stderr.on("data", (chunk: string) => handlers.onStderr?.(chunk));

        let timeout: NodeJS.Timeout | undefined;
        if (options.timeoutMs) {
            timeout = setTimeout(() => {
                this.cancel(jobId);
            }, options.timeoutMs);
        }

        return new Promise((resolve, reject) => {
            child.on("error", (err: Error) => {
                this.jobs.delete(jobId);
                if (timeout) clearTimeout(timeout);
                reject(err);
            });

            child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
                this.jobs.delete(jobId);
                if (timeout) clearTimeout(timeout);
                resolve({ code, signal, durationMs: Date.now() - start });
            });
        });
    }

    cancel(jobId: string) {
        const child = this.jobs.get(jobId);
        if (!child) return;

        if (os.platform() === "win32") {
            // Most reliable way to kill a process tree on Windows
            spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
                shell: true,
                windowsHide: true,
            });
        } else {
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 1500);
        }

        this.jobs.delete(jobId);
    }

    getPid(jobId: string): number | undefined {
        const child = this.jobs.get(jobId);
        return child?.pid;
    }

    hasJob(jobId: string): boolean {
        return this.jobs.has(jobId);
    }
}
