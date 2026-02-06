# DevFactory

DevFactory is a powerful desktop application and CLI tool designed to simplify the process of scaffolding and managing local development projects. It provides a streamlined workflow for developers to create, configure, and run projects across various frameworks with ease.

## 🚀 Features

- **Project Scaffolding**: Quickly generate new projects using popular frameworks.
- **CLI Tool**: Interactive CLI to define project specifications.
- **Cross-Platform**: Built with Electron to support Windows, macOS, and Linux.
- **Live Logs**: View real-time output from project creation and dev servers.
- **Clean Domains**: Manage local projects with clean, custom domain suffixes.

## 🛠️ Supported Frameworks (v1)

- Laravel
- React (Vite)
- Next.js
- Angular

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [npm](https://www.npmjs.com/)

## ⚙️ Installation

To set up the project locally, follow these steps:

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd "desktop app"
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Troubleshooting Installation**:
    If you encounter `ECONNRESET` or `EPERM` issues during `npm install`, try:
    ```bash
    npm cache clean --force
    # If on Windows, ensure no Electron processes are running
    npm install
    ```

## 🖥️ Usage

### CLI Commands

DevFactory includes a CLI tool for generating project specifications.

- **Create Project Spec**:
  ```bash
  node index.js create-spec
  ```
  Follow the interactive prompts to generate a `SPEC.md` file for your project.

### Desktop Application

To run the DevFactory desktop app:

- **Development Mode**:
  ```bash
  npm run dev
  ```
  This builds the TypeScript files and launches the Electron application with hot-reloading capabilities.

- **Production Build**:
  ```bash
  npm run build
  npm start
  ```

## 📁 Project Structure

- `src/`: Main source code for the Electron application.
  - `main/`: Main process logic.
  - `preload/`: Preload scripts for secure IPC communication.
  - `renderer/`: UI components and styles.
- `index.js`: CLI entry point.
- `create-spec.js`: Core logic for the specification generator.
- `package.json`: Project configuration and dependencies.

## 📄 License

This project is licensed under the ISC License.
