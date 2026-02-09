"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectNodePackageManager = detectNodePackageManager;
exports.getNodeInstallCommand = getNodeInstallCommand;
exports.getNodeRunDevArgs = getNodeRunDevArgs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** Detect Node package manager from lock files (pnpm > yarn > npm). */
function detectNodePackageManager(folderPath) {
    if (fs_1.default.existsSync(path_1.default.join(folderPath, "pnpm-lock.yaml")))
        return "pnpm";
    if (fs_1.default.existsSync(path_1.default.join(folderPath, "yarn.lock")))
        return "yarn";
    return "npm";
}
/** Install command for Node projects. */
function getNodeInstallCommand(manager) {
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
function getNodeRunDevArgs(manager, port) {
    switch (manager) {
        case "pnpm":
            return ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)];
        case "yarn":
            return ["run", "dev", "--host", "127.0.0.1", "--port", String(port)];
        default:
            return ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)];
    }
}
