import { OSAdapter } from "./adapter";

export class MacOSAdapter implements OSAdapter {
    getHostsPath(): string {
        return "/etc/hosts";
    }
    needsAdmin(): boolean {
        return true;
    }
    getApacheVhostsPath(): string {
        return process.env.APACHE_VHOSTS_CONF || "/usr/local/etc/httpd/extra/httpd-vhosts.conf";
    }
}
