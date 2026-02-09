"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const electron_1 = require("electron");
const sudo_prompt_1 = __importDefault(require("sudo-prompt"));
const child_process_1 = require("child_process");
const windows_1 = require("../os/windows");
const macos_1 = require("../os/macos");
const linux_1 = require("../os/linux");
class HostService {
    adapter;
    registryPath;
    marker = "# DevFactory Managed Domains";
    constructor() {
        const platform = os_1.default.platform();
        if (platform === "win32")
            this.adapter = new windows_1.WindowsAdapter();
        else if (platform === "darwin")
            this.adapter = new macos_1.MacOSAdapter();
        else
            this.adapter = new linux_1.LinuxAdapter();
        this.registryPath = path_1.default.join(electron_1.app.getPath("userData"), "domains.json");
    }
    getRegistry() {
        if (!fs_1.default.existsSync(this.registryPath))
            return [];
        try {
            return JSON.parse(fs_1.default.readFileSync(this.registryPath, "utf8"));
        }
        catch {
            return [];
        }
    }
    saveRegistry(domains) {
        if (!fs_1.default.existsSync(path_1.default.dirname(this.registryPath))) {
            fs_1.default.mkdirSync(path_1.default.dirname(this.registryPath), { recursive: true });
        }
        fs_1.default.writeFileSync(this.registryPath, JSON.stringify(domains, null, 2));
    }
    async addDomain(domain, projectId, ip = "127.0.0.1", documentRoot) {
        try {
            const hostsPath = this.adapter.getHostsPath();
            let content = fs_1.default.readFileSync(hostsPath, "utf8");
            // Backup if not exists
            const backupPath = `${hostsPath}.bak`;
            if (!fs_1.default.existsSync(backupPath)) {
                fs_1.default.copyFileSync(hostsPath, backupPath);
            }
            const entry = `${ip} ${domain}`;
            if (content.includes(domain)) {
                if (content.includes(entry)) {
                    // Hosts entry exists; still add/update Apache vhost if documentRoot provided
                    if (documentRoot)
                        await this.addApacheVhost(domain, documentRoot);
                    return { success: true };
                }
            }
            const lines = content.split(/\r?\n/);
            let markerIndex = lines.findIndex(l => l.includes(this.marker));
            if (markerIndex === -1) {
                lines.push("", this.marker, entry);
            }
            else {
                lines.splice(markerIndex + 1, 0, entry);
            }
            await this.writeHosts(lines.join(os_1.default.EOL));
            if (documentRoot)
                await this.addApacheVhost(domain, documentRoot);
            const registry = this.getRegistry();
            if (!registry.find(d => d.domain === domain)) {
                registry.push({ domain, projectId, createdAt: new Date().toISOString() });
                this.saveRegistry(registry);
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async removeDomain(domain) {
        try {
            const registry = this.getRegistry();
            if (!registry.find(d => d.domain === domain)) {
                return { success: false, error: "This domain is not managed by DevFactory." };
            }
            const hostsPath = this.adapter.getHostsPath();
            let content = fs_1.default.readFileSync(hostsPath, "utf8");
            const lines = content.split(/\r?\n/);
            const newLines = lines.filter(line => !line.trim().endsWith(domain));
            await this.writeHosts(newLines.join(os_1.default.EOL));
            await this.removeApacheVhost(domain);
            this.saveRegistry(registry.filter(d => d.domain !== domain));
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async isDomainMapped(domain) {
        try {
            const content = fs_1.default.readFileSync(this.adapter.getHostsPath(), "utf8");
            return content.includes(domain);
        }
        catch {
            return false;
        }
    }
    /** Get mapped domain for a project (projectId = project name as stored when mapping). */
    getDomainForProject(projectId) {
        const registry = this.getRegistry();
        const entry = registry.find((d) => d.projectId === projectId);
        return entry?.domain ?? null;
    }
    vhostMarker(domain, suffix) {
        return `# DevFactory VirtualHost - ${domain} - ${suffix}`;
    }
    async addApacheVhost(domain, documentRoot) {
        const vhostsPath = this.adapter.getApacheVhostsPath();
        if (!vhostsPath || !fs_1.default.existsSync(vhostsPath))
            return;
        const dirRoot = documentRoot.replace(/\\/g, "/");
        const block = [
            "",
            this.vhostMarker(domain, "start"),
            "<VirtualHost *:80>",
            `    ServerAdmin webmaster@${domain}`,
            `    DocumentRoot "${dirRoot}"`,
            `    ServerName ${domain}`,
            `    <Directory "${dirRoot}">`,
            "        Options Indexes FollowSymLinks",
            "        AllowOverride All",
            "        Require all granted",
            "    </Directory>",
            `    ErrorLog "logs/${domain.replace(/[^a-z0-9.-]/gi, "-")}-error.log"`,
            `    CustomLog "logs/${domain.replace(/[^a-z0-9.-]/gi, "-")}-access.log" common`,
            "</VirtualHost>",
            this.vhostMarker(domain, "end"),
            "",
        ].join(os_1.default.EOL);
        const content = fs_1.default.readFileSync(vhostsPath, "utf8");
        if (content.includes(this.vhostMarker(domain, "start"))) {
            const updated = this.removeVhostBlock(content, domain);
            fs_1.default.writeFileSync(vhostsPath, updated + block);
        }
        else {
            fs_1.default.appendFileSync(vhostsPath, block);
        }
    }
    removeApacheVhost(domain) {
        const vhostsPath = this.adapter.getApacheVhostsPath();
        if (!vhostsPath || !fs_1.default.existsSync(vhostsPath))
            return Promise.resolve();
        try {
            const content = fs_1.default.readFileSync(vhostsPath, "utf8");
            if (!content.includes(this.vhostMarker(domain, "start")))
                return Promise.resolve();
            fs_1.default.writeFileSync(vhostsPath, this.removeVhostBlock(content, domain));
        }
        catch {
            // ignore
        }
        return Promise.resolve();
    }
    removeVhostBlock(content, domain) {
        const startMarker = this.vhostMarker(domain, "start");
        const endMarker = this.vhostMarker(domain, "end");
        const startIdx = content.indexOf(startMarker);
        if (startIdx === -1)
            return content;
        const endIdx = content.indexOf(endMarker, startIdx);
        if (endIdx === -1)
            return content;
        const before = content.slice(0, startIdx).replace(/\n+$/, "");
        const after = content.slice(endIdx + endMarker.length).replace(/^\n+/, "");
        return (before + (after ? os_1.default.EOL + after : "")).trimEnd() + os_1.default.EOL;
    }
    writeHosts(content) {
        return new Promise((resolve, reject) => {
            const tempFile = path_1.default.join(os_1.default.tmpdir(), `hosts_${Date.now()}`);
            fs_1.default.writeFileSync(tempFile, content);
            const hostsPath = this.adapter.getHostsPath();
            if (os_1.default.platform() === "win32") {
                // Native PowerShell elevation for Windows
                const psCommand = `Start-Process cmd -ArgumentList '/c copy /Y "${tempFile}" "${hostsPath}"' -Verb RunAs -WindowStyle Hidden -Wait`;
                const cmd = `powershell -Command "${psCommand}"`;
                (0, child_process_1.exec)(cmd, (error) => {
                    if (error) {
                        // If PowerShell fails, try sudo-prompt just in case (if installed)
                        try {
                            sudo_prompt_1.default.exec(`copy /Y "${tempFile}" "${hostsPath}"`, { name: "DevFactory" }, (sudoErr) => {
                                if (sudoErr)
                                    reject(sudoErr);
                                else {
                                    if (fs_1.default.existsSync(tempFile))
                                        fs_1.default.unlinkSync(tempFile);
                                    resolve();
                                }
                            });
                        }
                        catch (e) {
                            reject(new Error("Admin permission required to edit hosts file. PowerShell elevation failed."));
                        }
                    }
                    else {
                        if (fs_1.default.existsSync(tempFile))
                            fs_1.default.unlinkSync(tempFile);
                        resolve();
                    }
                });
            }
            else {
                // macOS/Linux elevation via sudo-prompt
                sudo_prompt_1.default.exec(`cp "${tempFile}" "${hostsPath}"`, { name: "DevFactory" }, (error) => {
                    if (error)
                        reject(error);
                    else {
                        if (fs_1.default.existsSync(tempFile))
                            fs_1.default.unlinkSync(tempFile);
                        resolve();
                    }
                });
            }
        });
    }
}
exports.HostService = HostService;
