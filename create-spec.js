import inquirer from "inquirer";
import fs from "fs";

export async function createSpec() {
  const answers = await inquirer.prompt([
    { 
      name: "name", 
      message: "Product name?",
      default: "DevFactory"
    },
    { 
      name: "os", 
      type: "list", 
      message: "Target OS?",
      choices: ["Windows only", "Cross-platform (Win/macOS/Linux)"] 
    },
    {
      name: "frameworks",
      type: "checkbox",
      message: "Frameworks to support (v1)?",
      choices: ["Laravel", "React (Vite)", "Next.js", "Angular"],
      default: ["Laravel", "React (Vite)", "Next.js", "Angular"]
    },
    { 
      name: "domain", 
      type: "list", 
      message: "Default domain suffix?",
      choices: [".test", ".local", "custom"],
      default: ".test"
    },
    {
      name: "mvpScope",
      type: "list",
      message: "MVP scope?",
      choices: ["Scaffold only", "Scaffold + run dev server", "Full real domains (proxy)"],
      default: "Scaffold + run dev server"
    }
  ]);

  const spec = `
# ${answers.name} – Product Specification

## Goal
A cross-platform desktop application that scaffolds and manages local development projects with clean domains.

## Target OS
${answers.os}

## Supported Frameworks (v1)
${answers.frameworks.map(f => `- ${f}`).join('\n')}

## Default Domain
*${answers.domain}

## MVP Features
- Create new projects from UI
- Run official scaffold commands
- Show live logs
- Start dev servers
- Open browser automatically

## Non-Goals (v1)
- Docker integration
- Cloud deployments
- CI/CD
- Production hosting
- GitHub integration

## User Flow
1. User opens app
2. Clicks "New Project"
3. Selects framework
4. Enters name + path
5. App scaffolds project
6. App starts dev server
7. Browser opens at domain

## Definition of Done (v1)
User can create and run all supported frameworks from a single desktop app.
`;

  fs.writeFileSync("SPEC.md", spec.trim());
  console.log("SPEC.md created.");
}
