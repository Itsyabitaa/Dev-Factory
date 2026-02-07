"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsAdapter = void 0;
const path_1 = __importDefault(require("path"));
class WindowsAdapter {
    getHostsPath() {
        return path_1.default.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
    }
    needsAdmin() {
        return true;
    }
    getApacheVhostsPath() {
        return process.env.APACHE_VHOSTS_CONF || "D:\\localserver\\Apache24\\conf\\extra\\httpd-vhosts.conf";
    }
}
exports.WindowsAdapter = WindowsAdapter;
