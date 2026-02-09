import fs from "fs";
import path from "path";

export type NodePackageManager = "npm" | "pnpm" | "yarn";

/** Detect Node package manager from lock files (pnpm > yarn > npm). */
export function detectNodePackageManager(folderPath: string): NodePackageManager {
    if (fs.existsSync(path.join(folderPath, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(folderPath, "yarn.lock"))) return "yarn";
    return "npm";
}

/** Install command for Node projects. */
export function getNodeInstallCommand(
    manager: NodePackageManager
): { cmd: string; args: string[] } {
    switch (manager) {
        case "pnpm":
            return { cmd: "pnpm", args: ["install"] };
        case "yarn":
            return { cmd: "yarn", args: [] };
        default:
            return { cmd: "npm", args: ["install"] };
    }
}

/** Dev script runner for Node (e.g. npm run dev -- --port 3000). */
export function getNodeRunDevArgs(manager: NodePackageManager, port: number): string[] {
    switch (manager) {
        case "pnpm":
            return ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)];
        case "yarn":
            return ["run", "dev", "--host", "127.0.0.1", "--port", String(port)];
        default:
            return ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)];
    }
}
