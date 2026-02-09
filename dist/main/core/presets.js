"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESETS = void 0;
exports.getPreset = getPreset;
exports.getPresetsForFramework = getPresetsForFramework;
exports.PRESETS = [
    { id: "react", framework: "react", label: "React (default)" },
    { id: "react-ts", framework: "react", label: "React + TypeScript", scaffoldExtra: ["react-ts"] },
    { id: "react-ts-tailwind", framework: "react", label: "React + TS + Tailwind", scaffoldExtra: ["react-ts"], postSteps: [{ cmd: "npm", args: ["install", "-D", "tailwindcss", "postcss", "autoprefixer"] }, { cmd: "npx", args: ["tailwindcss", "init", "-p"] }] },
    { id: "next", framework: "next", label: "Next.js (default)" },
    { id: "next-ts", framework: "next", label: "Next.js + TypeScript" },
    { id: "angular", framework: "angular", label: "Angular (default)" },
    { id: "angular-routing-scss", framework: "angular", label: "Angular + routing + SCSS", scaffoldExtra: ["--routing", "--style=scss"] },
    { id: "laravel", framework: "laravel", label: "Laravel (default)" },
];
function getPreset(id) {
    return exports.PRESETS.find((p) => p.id === id);
}
function getPresetsForFramework(framework) {
    return exports.PRESETS.filter((p) => p.framework === framework);
}
