import fs from "fs";
import path from "path";
import os from "os";
import { app } from "electron";
import sudo from "sudo-prompt";
import { exec } from "child_process";
import { WindowsAdapter } from "../os/windows";
import { MacOSAdapter } from "../os/macos";
import { LinuxAdapter } from "../os/linux";
import { OSAdapter } from "../os/adapter";

export interface ManagedDomain {
    domain: string;
    projectId: string;
    createdAt: string;
}

export class HostService {
    private adapter: OSAdapter;
    private registryPath: string;
    private marker = "# DevFactory Managed Domains";

    constructor() {
        const platform = os.platform();
        if (platform === "win32") this.adapter = new WindowsAdapter();
        else if (platform === "darwin") this.adapter = new MacOSAdapter();
        else this.adapter = new LinuxAdapter();

        this.registryPath = path.join(app.getPath("userData"), "domains.json");
    }

    private getRegistry(): ManagedDomain[] {
        if (!fs.existsSync(this.registryPath)) return [];
        try {
            return JSON.parse(fs.readFileSync(this.registryPath, "utf8"));
        } catch {
            return [];
        }
    }

    private saveRegistry(domains: ManagedDomain[]) {
        if (!fs.existsSync(path.dirname(this.registryPath))) {
            fs.mkdirSync(path.dirname(this.registryPath), { recursive: true });
        }
        fs.writeFileSync(this.registryPath, JSON.stringify(domains, null, 2));
    }

    async addDomain(domain: string, projectId: string, ip = "127.0.0.1", documentRoot?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const hostsPath = this.adapter.getHostsPath();
            let content = fs.readFileSync(hostsPath, "utf8");

            // Backup if not exists
            const backupPath = `${hostsPath}.bak`;
            if (!fs.existsSync(backupPath)) {
                fs.copyFileSync(hostsPath, backupPath);
            }

            const entry = `${ip} ${domain}`;
            if (content.includes(domain)) {
                if (content.includes(entry)) {
                    // Hosts entry exists; still add/update Apache vhost if documentRoot provided
                    if (documentRoot) await this.addApacheVhost(domain, documentRoot);
                    return { success: true };
                }
            }

            const lines = content.split(/\r?\n/);
            let markerIndex = lines.findIndex(l => l.includes(this.marker));

            if (markerIndex === -1) {
                lines.push("", this.marker, entry);
            } else {
                lines.splice(markerIndex + 1, 0, entry);
            }

            await this.writeHosts(lines.join(os.EOL));

            if (documentRoot) await this.addApacheVhost(domain, documentRoot);

            const registry = this.getRegistry();
            if (!registry.find(d => d.domain === domain)) {
                registry.push({ domain, projectId, createdAt: new Date().toISOString() });
                this.saveRegistry(registry);
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async removeDomain(domain: string): Promise<{ success: boolean; error?: string }> {
        try {
            const registry = this.getRegistry();
            if (!registry.find(d => d.domain === domain)) {
                return { success: false, error: "This domain is not managed by DevFactory." };
            }

            const hostsPath = this.adapter.getHostsPath();
            let content = fs.readFileSync(hostsPath, "utf8");
            const lines = content.split(/\r?\n/);
            const newLines = lines.filter(line => !line.trim().endsWith(domain));
            await this.writeHosts(newLines.join(os.EOL));

            await this.removeApacheVhost(domain);
            this.saveRegistry(registry.filter(d => d.domain !== domain));

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    async isDomainMapped(domain: string): Promise<boolean> {
        try {
            const content = fs.readFileSync(this.adapter.getHostsPath(), "utf8");
            return content.includes(domain);
        } catch {
            return false;
        }
    }

    private vhostMarker(domain: string, suffix: "start" | "end"): string {
        return `# DevFactory VirtualHost - ${domain} - ${suffix}`;
    }

    private async addApacheVhost(domain: string, documentRoot: string): Promise<void> {
        const vhostsPath = this.adapter.getApacheVhostsPath();
        if (!vhostsPath || !fs.existsSync(vhostsPath)) return;

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
        ].join(os.EOL);

        const content = fs.readFileSync(vhostsPath, "utf8");
        if (content.includes(this.vhostMarker(domain, "start"))) {
            const updated = this.removeVhostBlock(content, domain);
            fs.writeFileSync(vhostsPath, updated + block);
        } else {
            fs.appendFileSync(vhostsPath, block);
        }
    }

    private removeApacheVhost(domain: string): Promise<void> {
        const vhostsPath = this.adapter.getApacheVhostsPath();
        if (!vhostsPath || !fs.existsSync(vhostsPath)) return Promise.resolve();
        try {
            const content = fs.readFileSync(vhostsPath, "utf8");
            if (!content.includes(this.vhostMarker(domain, "start"))) return Promise.resolve();
            fs.writeFileSync(vhostsPath, this.removeVhostBlock(content, domain));
        } catch {
            // ignore
        }
        return Promise.resolve();
    }

    private removeVhostBlock(content: string, domain: string): string {
        const startMarker = this.vhostMarker(domain, "start");
        const endMarker = this.vhostMarker(domain, "end");
        const startIdx = content.indexOf(startMarker);
        if (startIdx === -1) return content;
        const endIdx = content.indexOf(endMarker, startIdx);
        if (endIdx === -1) return content;
        const before = content.slice(0, startIdx).replace(/\n+$/, "");
        const after = content.slice(endIdx + endMarker.length).replace(/^\n+/, "");
        return (before + (after ? os.EOL + after : "")).trimEnd() + os.EOL;
    }

    private writeHosts(content: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempFile = path.join(os.tmpdir(), `hosts_${Date.now()}`);
            fs.writeFileSync(tempFile, content);

            const hostsPath = this.adapter.getHostsPath();

            if (os.platform() === "win32") {
                // Native PowerShell elevation for Windows
                const psCommand = `Start-Process cmd -ArgumentList '/c copy /Y "${tempFile}" "${hostsPath}"' -Verb RunAs -WindowStyle Hidden -Wait`;
                const cmd = `powershell -Command "${psCommand}"`;

                exec(cmd, (error) => {
                    if (error) {
                        // If PowerShell fails, try sudo-prompt just in case (if installed)
                        try {
                            sudo.exec(`copy /Y "${tempFile}" "${hostsPath}"`, { name: "DevFactory" }, (sudoErr: any) => {
                                if (sudoErr) reject(sudoErr);
                                else {
                                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                                    resolve();
                                }
                            });
                        } catch (e) {
                            reject(new Error("Admin permission required to edit hosts file. PowerShell elevation failed."));
                        }
                    } else {
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                        resolve();
                    }
                });
            } else {
                // macOS/Linux elevation via sudo-prompt
                sudo.exec(`cp "${tempFile}" "${hostsPath}"`, { name: "DevFactory" }, (error: any) => {
                    if (error) reject(error);
                    else {
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                        resolve();
                    }
                });
            }
        });
    }
}
