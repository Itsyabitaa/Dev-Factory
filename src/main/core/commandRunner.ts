import { spawn, ChildProcess, execSync } from "child_process";
import os from "os";
import path from "path";
import fs from "fs";

let resolvedPath: string | null = null;

/** On Linux/macOS, GUI-launched apps often don't get the same PATH as the terminal (e.g. nvm/fnm). Resolve a PATH that finds node/npm. */
function getResolvedPath(): string {
    if (resolvedPath) return resolvedPath;
    if (os.platform() === "win32") {
        resolvedPath = process.env.PATH || "";
        return resolvedPath;
    }
    try {
        const home = process.env.HOME || os.homedir();
        const pathFromShell = execSync("bash -lc 'echo $PATH'", {
            encoding: "utf8",
            timeout: 3000,
            env: { ...process.env, HOME: home },
        }).trim();
        if (pathFromShell) {
            resolvedPath = pathFromShell;
            return resolvedPath;
        }
    } catch (_) {
        // ignore
    }
    const home = process.env.HOME || os.homedir();
    const extra: string[] = [];
    try {
        const nvmVersions = path.join(home, ".nvm", "versions", "node");
        if (fs.existsSync(nvmVersions)) {
            for (const dir of fs.readdirSync(nvmVersions)) {
                const bin = path.join(nvmVersions, dir, "bin");
                if (fs.existsSync(bin)) extra.push(bin);
            }
        }
        const nvmCurrent = path.join(home, ".nvm", "current", "bin");
        if (fs.existsSync(nvmCurrent)) extra.push(nvmCurrent);
    } catch (_) {
        /* ignore */
    }
    try {
        const fnmDir = path.join(home, ".local", "share", "fnm");
        if (fs.existsSync(fnmDir)) {
            for (const dir of fs.readdirSync(fnmDir)) {
                const bin = path.join(fnmDir, dir, "installation", "bin");
                if (fs.existsSync(bin)) extra.push(bin);
            }
        }
    } catch (_) {
        /* ignore */
    }
    extra.push("/usr/local/bin", "/usr/bin");
    resolvedPath = [...extra, process.env.PATH || ""].join(path.delimiter);
    return resolvedPath;
}

function getRunEnv(options: RunOptions): NodeJS.ProcessEnv {
    const base = os.platform() === "win32" ? process.env : { ...process.env, PATH: getResolvedPath() };
    return { ...base, ...options.env };
}

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
    private jobs = new Map<string, ChildProcess>();

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
            env: getRunEnv(options),
            shell: useShell,
            windowsHide: true,
        });

        this.jobs.set(jobId, child);

        if (child.stdout) child.stdout.setEncoding("utf8");
        if (child.stderr) child.stderr.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => handlers.onStdout?.(chunk));
        child.stderr?.on("data", (chunk: string) => handlers.onStderr?.(chunk));

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

    /** Run a full shell command string (e.g. for custom run profiles). */
    runShell(
        jobId: string,
        command: string,
        options: RunOptions = {},
        handlers: Handlers = {}
    ): Promise<RunResult> {
        if (this.jobs.has(jobId)) throw new Error(`Job already exists: ${jobId}`);
        const start = Date.now();
        const shell = os.platform() === "win32" ? "cmd.exe" : "/bin/sh";
        const args = os.platform() === "win32" ? ["/c", command] : ["-c", command];
        const child = spawn(shell, args, {
            cwd: options.cwd,
            env: getRunEnv(options),
            shell: false,
            windowsHide: true,
        });
        this.jobs.set(jobId, child);
        if (child.stdout) child.stdout.setEncoding("utf8");
        if (child.stderr) child.stderr.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => handlers.onStdout?.(chunk));
        child.stderr?.on("data", (chunk: string) => handlers.onStderr?.(chunk));
        let timeout: NodeJS.Timeout | undefined;
        if (options.timeoutMs) {
            timeout = setTimeout(() => this.cancel(jobId), options.timeoutMs);
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

    getAllJobIds(): string[] {
        return Array.from(this.jobs.keys());
    }

    cancelAll() {
        for (const jobId of this.getAllJobIds()) {
            this.cancel(jobId);
        }
    }
}
