import fs from "fs";
import path from "path";
import { app } from "electron";

export type LogLevel = "info" | "warn" | "error" | "debug";

export class LogService {
    private logDir: string;
    private buffer: string[] = [];
    private maxBuffer = 5000;
    private sessionFile: string;

    constructor() {
        this.logDir = path.join(app.getPath("userData"), "logs");
        this.sessionFile = path.join(this.logDir, `session-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
    }

    private ensureDir() {
        if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    }

    private format(level: LogLevel, message: string, meta?: unknown): string {
        const ts = new Date().toISOString();
        const metaStr = meta !== undefined ? " " + JSON.stringify(meta) : "";
        return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
    }

    private write(level: LogLevel, message: string, meta?: unknown) {
        const line = this.format(level, message, meta);
        this.buffer.push(line);
        if (this.buffer.length > this.maxBuffer) this.buffer.shift();
        this.ensureDir();
        try {
            fs.appendFileSync(this.sessionFile, line);
        } catch {
            // ignore
        }
    }

    info(message: string, meta?: unknown) {
        this.write("info", message, meta);
    }

    warn(message: string, meta?: unknown) {
        this.write("warn", message, meta);
    }

    error(message: string, meta?: unknown) {
        this.write("error", message, meta);
    }

    debug(message: string, meta?: unknown) {
        this.write("debug", message, meta);
    }

    /** Log command run (from CommandRunner / server). */
    logCommand(jobId: string, command: string, args: string[], outcome: string) {
        this.info("command", { jobId, command, args: args.slice(0, 10), outcome });
    }

    /** Log proxy event. */
    logProxy(event: string, detail?: string) {
        this.info("proxy", { event, detail });
    }

    /** Get all log content for export (current buffer + recent session files). */
    getExportContent(): string {
        const header = `DevFactory Log Export\n${new Date().toISOString()}\n\n`;
        const parts: string[] = [this.buffer.join("")];
        if (fs.existsSync(this.logDir)) {
            const files = fs.readdirSync(this.logDir)
                .filter((f) => f.startsWith("session-") && f.endsWith(".log"))
                .map((f) => ({ path: path.join(this.logDir, f), mtime: fs.statSync(path.join(this.logDir, f)).mtime.getTime() }))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(1, 6);
            for (const f of files) {
                try {
                    parts.push("--- previous session ---\n" + fs.readFileSync(f.path, "utf8"));
                } catch {
                    // skip
                }
            }
        }
        return header + parts.join("\n");
    }

    /** Return path to logs directory for "Open logs folder". */
    getLogsDir(): string {
        this.ensureDir();
        return this.logDir;
    }
}
