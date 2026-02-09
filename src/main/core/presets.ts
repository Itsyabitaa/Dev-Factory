import type { Framework } from "./projectService";

export interface PresetOption {
    id: string;
    label: string;
    framework: Framework;
    /** For React (Vite): template name. For Next: extra flags. For Angular: ng new options. For Laravel: variant. */
    scaffoldExtra?: string[];
    /** Post-scaffold: npm/php commands to run (e.g. add Tailwind). */
    postSteps?: { cmd: string; args: string[] }[];
}

export const PRESETS: PresetOption[] = [
    { id: "react", framework: "react", label: "React (default)" },
    { id: "react-ts", framework: "react", label: "React + TypeScript", scaffoldExtra: ["react-ts"] },
    { id: "react-ts-tailwind", framework: "react", label: "React + TS + Tailwind", scaffoldExtra: ["react-ts"], postSteps: [{ cmd: "npm", args: ["install", "-D", "tailwindcss", "postcss", "autoprefixer"] }, { cmd: "npx", args: ["tailwindcss", "init", "-p"] }] },
    { id: "next", framework: "next", label: "Next.js (default)" },
    { id: "next-ts", framework: "next", label: "Next.js + TypeScript" },
    { id: "angular", framework: "angular", label: "Angular (default)" },
    { id: "angular-routing-scss", framework: "angular", label: "Angular + routing + SCSS", scaffoldExtra: ["--routing", "--style=scss"] },
    { id: "laravel", framework: "laravel", label: "Laravel (default)" },
];

export function getPreset(id: string): PresetOption | undefined {
    return PRESETS.find((p) => p.id === id);
}

export function getPresetsForFramework(framework: Framework): PresetOption[] {
    return PRESETS.filter((p) => p.framework === framework);
}
