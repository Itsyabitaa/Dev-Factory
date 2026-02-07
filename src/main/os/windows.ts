import { OSAdapter } from "./adapter";
import path from "path";

export class WindowsAdapter implements OSAdapter {
    getHostsPath(): string {
        return path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
    }
    needsAdmin(): boolean {
        return true;
    }
    getApacheVhostsPath(): string {
        return process.env.APACHE_VHOSTS_CONF || "D:\\localserver\\Apache24\\conf\\extra\\httpd-vhosts.conf";
    }
}
