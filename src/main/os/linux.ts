import { OSAdapter } from "./adapter";

export class LinuxAdapter implements OSAdapter {
    getHostsPath(): string {
        return "/etc/hosts";
    }
    needsAdmin(): boolean {
        return true;
    }
    getApacheVhostsPath(): string {
        return process.env.APACHE_VHOSTS_CONF || "/etc/apache2/sites-available/000-default.conf";
    }
}
