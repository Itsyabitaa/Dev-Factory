# DevFactory

DevFactory is a powerful desktop application and CLI tool designed to simplify the process of scaffolding and managing local development projects. It provides a streamlined workflow for developers to create, configure, and run projects across various frameworks with ease.

## 🚀 Features

- **Project Scaffolding**: Quickly generate new projects using popular frameworks.
- **CLI Tool**: Interactive CLI to define project specifications.
- **Cross-Platform**: Built with Electron to support Windows, macOS, and Linux.
- **Live Logs**: View real-time output from project creation and dev servers.
- **Clean Domains**: Manage local projects with clean, custom domain suffixes.
- **Local Proxy**: Run a local proxy (Caddy) so you can open `http://myapp.test:8080` without typing the dev server port.

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

### Local proxy (real domains without ports)

The app can route `http://<project>.test:8080` to your running dev server so you don’t need to remember ports.

1. **Install Caddy** (required for the proxy):
   - Download from [caddyserver.com/download](https://caddyserver.com/download) for your OS.
   - Place the binary in the app’s `bin` folder:
     - **Windows**: `%APPDATA%\devfactory\bin\caddy.exe`
     - **macOS**: `~/Library/Application Support/devfactory/bin/caddy`
     - **Linux**: `~/.config/devfactory/bin/caddy`
2. In the app header, click **Start Proxy**. The proxy listens on port **8080** (no admin rights needed).
3. Create a project with **Create domain mapping** so `myapp.test` points to `127.0.0.1`.
4. Start the project, then use **Open Domain** to open `http://myapp.test:8080`.

If port 8080 is in use, the app will show a clear error; free the port or stop the other service.

## 📦 Packaging & installers

Build installers for your OS (no proxy binary is bundled; install Caddy separately if you use the proxy):

```bash
npm run dist        # Build for current OS
npm run dist:win    # Windows: NSIS + portable
npm run dist:mac    # macOS: .dmg
npm run dist:linux  # Linux: AppImage + .deb
```

Output goes to the `release/` folder. The app runs without dev tooling once installed.

### Step-by-step: Send the app to Linux users

1. **Set your GitHub repo** in `package.json` (if not already):
   ```json
   "repository": { "type": "git", "url": "https://github.com/Itsyabitaa/Dev-Factory.git" }
   ```
   (Already set for this repo.)

2. **Push your code** (including `.github/workflows/release.yml`) to GitHub:
   ```bash
   git add .
   git commit -m "Add release workflow"
   git push origin master
   ```

3. **Bump the version** in `package.json` (e.g. `"version": "1.0.0"` → `"1.0.1"`), commit and push.

4. **Create a new release on GitHub:**
   - Open your repo on GitHub → **Releases** → **Draft a new release**.
   - **Choose a tag:** type a new tag (e.g. `v1.0.1`) and create it.
   - Add release title/notes if you want.
   - Click **Publish release** (not “Save draft”).

5. **Wait for the workflow** (about 2–5 minutes):
   - Go to **Actions** → open the run **“Release (build Linux and attach to release)”**.
   - It will build the Linux app and attach **DevFactory-1.0.1.AppImage** and **devfactory_1.0.1_amd64.deb** (and `latest-linux.yml`) to that release.

6. **Tell Linux users where to download:**
   - Send them: **https://github.com/Itsyabitaa/Dev-Factory/releases**
   - They open the latest release (e.g. v1.0.1) and download:
     - **DevFactory-1.0.1.AppImage** (run directly on most distros), or  
     - **devfactory_1.0.1_amd64.deb** (install on Debian/Ubuntu with `sudo dpkg -i devfactory_1.0.1_amd64.deb`).

**Where is the app for Linux users?** Building Linux on Windows (`npm run dist:linux`) can fail when downloading the Electron Linux zip (network/connection closed). Use the **GitHub Actions** workflow instead: push to `master`/`main` or run the “Build Linux” workflow manually; the Linux artifacts (AppImage, .deb, `latest-linux.yml`) will be in the run’s **Artifacts** (download `release-linux`). To put the Linux app where users can get it: create a GitHub Release (tag e.g. v1.0.0) and publish it; the "Release (build Linux and attach to release)" workflow will build and attach the AppImage and .deb so Linux users can download from the Releases page.

## 📂 App data (persistent, no writes to install dir)

All persistent data lives in the OS app-data directory:

| Item          | Location (relative to app data) |
|---------------|----------------------------------|
| Projects list | `projects.json`                  |
| Domain map    | `domains.json`                   |
| Proxy config  | `proxy/Caddyfile`                |
| Logs          | `logs/` (session logs + export)  |

- **Windows**: `%APPDATA%\devfactory\`
- **macOS**: `~/Library/Application Support/devfactory/`
- **Linux**: `~/.config/devfactory/`

Reinstalling the app does not delete these; uninstall does not remove them unless you choose to delete app data.

## 🌐 Distributing the app and updates

**Can I share the .exe with the public?** Yes. You can host the installer or portable exe for download (e.g. on GitHub Releases, your website, or a file host). Unsigned builds may show a SmartScreen warning on first run; users can choose “Run anyway.” For wider trust, consider [code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) (Windows: EV certificate).

**How do users get updates?** The app uses **electron-updater** and checks for updates on startup (when running the installed or portable build, not in dev). When you publish a new version, users are prompted to restart to install it.

### Publishing so the app can find updates (GitHub Releases)

1. **Set your repo** in `package.json`:
   ```json
   "repository": { "type": "git", "url": "https://github.com/Itsyabitaa/Dev-Factory.git" }
   ```
   (Already set for this repo.)

2. **Create a GitHub release** for each version (e.g. tag `v1.0.0`).

3. **Upload build artifacts** to that release:
   - **Windows**: `DevFactory Setup 1.0.0.exe` and `latest.yml`.
   - **macOS**: The `.dmg` and `latest-mac.yml`.
   - **Linux**: `DevFactory-1.0.0.AppImage` (and optionally `devfactory_1.0.0_amd64.deb`) and `latest-linux.yml` from `release/`.

   The app looks at the `latest.yml` (and platform-specific files) to know the newest version and download URL.

4. **Optional – publish from CI**: To publish from GitHub Actions, set a `GH_TOKEN` secret and run `npm run dist:win` (or your target); electron-builder can publish to GitHub Releases when `build.publish` is set to `{ "provider": "github" }`.

### Release checklist

1. Bump `version` in `package.json`.
2. Run `npm run dist:win` (or `dist:mac` / `dist:linux`).
3. Create a new release on GitHub with tag `v1.0.1` (match the version).
4. Upload the installer and `latest.yml` (and any other `latest-*.yml`) from `release/`.
5. Users with the app open will get an update prompt after the next check (or on next launch); they click “Restart now” to install.

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
