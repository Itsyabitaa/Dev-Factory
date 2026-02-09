"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortService = void 0;
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const PORT_MIN = 5100;
const PORT_MAX = 5900;
class PortService {
    manifestPath;
    constructor() {
        this.manifestPath = path_1.default.join(electron_1.app.getPath("userData"), "projects.json");
    }
    readProjects() {
        if (!fs_1.default.existsSync(this.manifestPath))
            return [];
        try {
            return JSON.parse(fs_1.default.readFileSync(this.manifestPath, "utf8"));
        }
        catch {
            return [];
        }
    }
    writeProjects(projects) {
        if (!fs_1.default.existsSync(path_1.default.dirname(this.manifestPath))) {
            fs_1.default.mkdirSync(path_1.default.dirname(this.manifestPath), { recursive: true });
        }
        fs_1.default.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
    }
    isPortFree(port) {
        return new Promise((resolve) => {
            const server = net_1.default.createServer(() => { });
            server.once("error", () => resolve(false));
            server.once("listening", () => {
                server.close(() => resolve(true));
            });
            server.listen(port, "127.0.0.1");
        });
    }
    /** Get or allocate port for a project (by fullPath). Persists in manifest. */
    async getPortForProject(fullPath) {
        const projects = this.readProjects();
        const project = projects.find((p) => p.fullPath === fullPath);
        if (project?.port != null) {
            const free = await this.isPortFree(project.port);
            if (free)
                return project.port;
        }
        const usedPorts = new Set(projects.map((p) => p.port).filter((p) => p != null));
        for (let port = PORT_MIN; port <= PORT_MAX; port++) {
            if (usedPorts.has(port))
                continue;
            if (await this.isPortFree(port)) {
                const updated = projects.map((p) => p.fullPath === fullPath ? { ...p, port } : p);
                const idx = updated.findIndex((p) => p.fullPath === fullPath);
                if (idx >= 0) {
                    updated[idx] = { ...updated[idx], port };
                }
                this.writeProjects(updated);
                return port;
            }
        }
        throw new Error("No free port in range 5100–5900");
    }
    /** Get stored port for project (no allocation). */
    getStoredPort(fullPath) {
        const projects = this.readProjects();
        const project = projects.find((p) => p.fullPath === fullPath);
        return project?.port;
    }
}
exports.PortService = PortService;
