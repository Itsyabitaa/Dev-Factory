import fs from "fs";
import net from "net";
import path from "path";
import { app } from "electron";

const PORT_MIN = 5100;
const PORT_MAX = 5900;

export interface ProjectManifestEntry {
    name: string;
    framework: string;
    path: string;
    fullPath: string;
    createdAt: string;
    port?: number;
    [key: string]: unknown;
}

export class PortService {
    private manifestPath: string;

    constructor() {
        this.manifestPath = path.join(app.getPath("userData"), "projects.json");
    }

    private readProjects(): ProjectManifestEntry[] {
        if (!fs.existsSync(this.manifestPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
        } catch {
            return [];
        }
    }

    private writeProjects(projects: ProjectManifestEntry[]) {
        if (!fs.existsSync(path.dirname(this.manifestPath))) {
            fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
        }
        fs.writeFileSync(this.manifestPath, JSON.stringify(projects, null, 2));
    }

    isPortFree(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer(() => {});
            server.once("error", () => resolve(false));
            server.once("listening", () => {
                server.close(() => resolve(true));
            });
            server.listen(port, "127.0.0.1");
        });
    }

    /** Get or allocate port for a project (by fullPath). Persists in manifest. */
    async getPortForProject(fullPath: string): Promise<number> {
        const projects = this.readProjects();
        const project = projects.find((p) => p.fullPath === fullPath);
        if (project?.port != null) {
            const free = await this.isPortFree(project.port);
            if (free) return project.port;
        }

        const usedPorts = new Set(projects.map((p) => p.port).filter((p): p is number => p != null));
        for (let port = PORT_MIN; port <= PORT_MAX; port++) {
            if (usedPorts.has(port)) continue;
            if (await this.isPortFree(port)) {
                const updated = projects.map((p) =>
                    p.fullPath === fullPath ? { ...p, port } : p
                );
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
    getStoredPort(fullPath: string): number | undefined {
        const projects = this.readProjects();
        const project = projects.find((p) => p.fullPath === fullPath);
        return project?.port;
    }
}
