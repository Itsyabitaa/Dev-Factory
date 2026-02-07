"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinuxAdapter = void 0;
class LinuxAdapter {
    getHostsPath() {
        return "/etc/hosts";
    }
    needsAdmin() {
        return true;
    }
    getApacheVhostsPath() {
        return process.env.APACHE_VHOSTS_CONF || "/etc/apache2/sites-available/000-default.conf";
    }
}
exports.LinuxAdapter = LinuxAdapter;
