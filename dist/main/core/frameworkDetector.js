"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFramework = detectFramework;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** Best-effort detection of framework from an existing project folder. */
function detectFramework(folderPath) {
    if (!fs_1.default.existsSync(folderPath) || !fs_1.default.statSync(folderPath).isDirectory())
        return null;
    // Laravel: artisan, composer.json, routes/, public/
    const artisan = fs_1.default.existsSync(path_1.default.join(folderPath, "artisan"));
    const composerJson = fs_1.default.existsSync(path_1.default.join(folderPath, "composer.json"));
    const routesDir = fs_1.default.existsSync(path_1.default.join(folderPath, "routes"));
    const publicDir = fs_1.default.existsSync(path_1.default.join(folderPath, "public"));
    if (artisan && composerJson && routesDir && publicDir)
        return "laravel";
    // Angular: angular.json
    if (fs_1.default.existsSync(path_1.default.join(folderPath, "angular.json")))
        return "angular";
    // Next.js: next.config.* or package.json has "next"
    const nextConfig = fs_1.default.existsSync(path_1.default.join(folderPath, "next.config.js")) ||
        fs_1.default.existsSync(path_1.default.join(folderPath, "next.config.mjs")) ||
        fs_1.default.existsSync(path_1.default.join(folderPath, "next.config.ts"));
    const pkgPath = path_1.default.join(folderPath, "package.json");
    if (fs_1.default.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, "utf8"));
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            if (deps.next || nextConfig)
                return "next";
            if (deps.vite)
                return "react";
        }
        catch {
            // ignore
        }
    }
    if (nextConfig)
        return "next";
    // React (Vite): vite.config.* or package.json has vite
    const viteConfig = fs_1.default.existsSync(path_1.default.join(folderPath, "vite.config.js")) ||
        fs_1.default.existsSync(path_1.default.join(folderPath, "vite.config.ts"));
    if (viteConfig)
        return "react";
    return null;
}
