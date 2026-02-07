export interface OSAdapter {
    getHostsPath(): string;
    needsAdmin(): boolean;
    /** Path to Apache vhosts config file; empty string if not configured. */
    getApacheVhostsPath(): string;
}
