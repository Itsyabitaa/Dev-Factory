import fs from "fs";
import path from "path";
import type { Framework } from "./projectService";

/** Best-effort detection of framework from an existing project folder. */
export function detectFramework(folderPath: string): Framework | null {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return null;

    // Laravel: artisan, composer.json, routes/, public/
    const artisan = fs.existsSync(path.join(folderPath, "artisan"));
    const composerJson = fs.existsSync(path.join(folderPath, "composer.json"));
    const routesDir = fs.existsSync(path.join(folderPath, "routes"));
    const publicDir = fs.existsSync(path.join(folderPath, "public"));
    if (artisan && composerJson && routesDir && publicDir) return "laravel";

    // Angular: angular.json
    if (fs.existsSync(path.join(folderPath, "angular.json"))) return "angular";

    // Next.js: next.config.* or package.json has "next"
    const nextConfig =
        fs.existsSync(path.join(folderPath, "next.config.js")) ||
        fs.existsSync(path.join(folderPath, "next.config.mjs")) ||
        fs.existsSync(path.join(folderPath, "next.config.ts"));
    const pkgPath = path.join(folderPath, "package.json");
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            if (deps.next || nextConfig) return "next";
            if (deps.vite) return "react";
        } catch {
            // ignore
        }
    }
    if (nextConfig) return "next";

    // React (Vite): vite.config.* or package.json has vite
    const viteConfig =
        fs.existsSync(path.join(folderPath, "vite.config.js")) ||
        fs.existsSync(path.join(folderPath, "vite.config.ts"));
    if (viteConfig) return "react";

    return null;
}
