"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
class LogService {
    logDir;
    buffer = [];
    maxBuffer = 5000;
    sessionFile;
    constructor() {
        this.logDir = path_1.default.join(electron_1.app.getPath("userData"), "logs");
        this.sessionFile = path_1.default.join(this.logDir, `session-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
    }
    ensureDir() {
        if (!fs_1.default.existsSync(this.logDir))
            fs_1.default.mkdirSync(this.logDir, { recursive: true });
    }
    format(level, message, meta) {
        const ts = new Date().toISOString();
        const metaStr = meta !== undefined ? " " + JSON.stringify(meta) : "";
        return `[${ts}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
    }
    write(level, message, meta) {
        const line = this.format(level, message, meta);
        this.buffer.push(line);
        if (this.buffer.length > this.maxBuffer)
            this.buffer.shift();
        this.ensureDir();
        try {
            fs_1.default.appendFileSync(this.sessionFile, line);
        }
        catch {
            // ignore
        }
    }
    info(message, meta) {
        this.write("info", message, meta);
    }
    warn(message, meta) {
        this.write("warn", message, meta);
    }
    error(message, meta) {
        this.write("error", message, meta);
    }
    debug(message, meta) {
        this.write("debug", message, meta);
    }
    /** Log command run (from CommandRunner / server). */
    logCommand(jobId, command, args, outcome) {
        this.info("command", { jobId, command, args: args.slice(0, 10), outcome });
    }
    /** Log proxy event. */
    logProxy(event, detail) {
        this.info("proxy", { event, detail });
    }
    /** Get all log content for export (current buffer + recent session files). */
    getExportContent() {
        const header = `DevFactory Log Export\n${new Date().toISOString()}\n\n`;
        const parts = [this.buffer.join("")];
        if (fs_1.default.existsSync(this.logDir)) {
            const files = fs_1.default.readdirSync(this.logDir)
                .filter((f) => f.startsWith("session-") && f.endsWith(".log"))
                .map((f) => ({ path: path_1.default.join(this.logDir, f), mtime: fs_1.default.statSync(path_1.default.join(this.logDir, f)).mtime.getTime() }))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(1, 6);
            for (const f of files) {
                try {
                    parts.push("--- previous session ---\n" + fs_1.default.readFileSync(f.path, "utf8"));
                }
                catch {
                    // skip
                }
            }
        }
        return header + parts.join("\n");
    }
    /** Return path to logs directory for "Open logs folder". */
    getLogsDir() {
        this.ensureDir();
        return this.logDir;
    }
}
exports.LogService = LogService;
