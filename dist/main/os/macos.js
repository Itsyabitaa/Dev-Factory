"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacOSAdapter = void 0;
class MacOSAdapter {
    getHostsPath() {
        return "/etc/hosts";
    }
    needsAdmin() {
        return true;
    }
    getApacheVhostsPath() {
        return process.env.APACHE_VHOSTS_CONF || "/usr/local/etc/httpd/extra/httpd-vhosts.conf";
    }
}
exports.MacOSAdapter = MacOSAdapter;
