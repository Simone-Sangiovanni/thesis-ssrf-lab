const fs = require('fs').promises;
const path = require('path');
const ipaddr = require('ipaddr.js');
const dns = require('dns').promises;

const configUtils = require('../utils/config_utils.js');
const urlUtils = require('../utils/url_utils.js');

// ======================== Helper Functions ========================

/**
 * Checks if a hostname resolves to any private/local IP address.
 * Used as an SSRF guard to block localhost / internal network access.
 *
 * @param {string} hostname - Domain name or IP address.
 * @returns {Promise<boolean>} - True if the host is local/private (block), false otherwise.
 */
async function isLocalHost(hostname) {
    try {
        // dns.lookup with { all: true } queries the OS (exactly like fetch would).
        // If hostname is an IP, it returns that IP.
        // If it's a domain, it returns ALL resolved IP addresses (IPv4 and IPv6).
        const addresses = await dns.lookup(hostname, { all: true });

        // If ANY resolved address is private/local, treat the host as local.
        return addresses.some(record => isPrivateIp(record.address));
    } catch (error) {
        // FAIL CLOSED: If DNS resolution fails (e.g., host doesn't exist, timeout),
        // assume it's dangerous and block. This prevents unexpected bypasses.
        console.warn(`[SSRF Guard] DNS resolution failed for ${hostname}:`, error.message);
        return true; // Return true to indicate "yes, block it"
    }
}

/**
 * Determines whether an IP address is private, loopback, link-local, or unspecified.
 * Supports both IPv4 and IPv6, including IPv4-mapped IPv6 addresses.
 *
 * @param {string} ip - The IP address as a string.
 * @returns {boolean} - True if the IP is considered local/private.
 */
function isPrivateIp(ip) {
    try {
        const addr = ipaddr.parse(ip);
        if (addr.kind() === 'ipv4') {
            const range = addr.range();
            return range === 'private' ||
                   range === 'loopback' ||
                   range === 'linkLocal' ||
                   range === 'unspecified';
        }
        if (addr.kind() === 'ipv6') {
            // IPv4-mapped IPv6 (e.g., ::ffff:192.168.1.1)
            if (addr.isIPv4MappedAddress()) {
                const ipv4 = addr.toIPv4Address();
                const range = ipv4.range();
                return range === 'private' ||
                       range === 'loopback' ||
                       range === 'linkLocal' ||
                       range === 'unspecified';
            }
            const range = addr.range();
            return range === 'loopback' ||
                   range === 'linkLocal' ||
                   range === 'uniqueLocal';   // IPv6 unique local addresses (ULA)
        }
    } catch {
        // Invalid IP string → not a local IP
    }
    return false;
}

/**
 * Checks if a given protocol is allowed by the level configuration.
 *
 * @param {string} protocol - The protocol name (e.g., 'http', 'file').
 * @param {string[]} allowedProtocols - List of allowed protocols.
 * @returns {boolean} - True if allowed, false otherwise.
 */
function isProtocolAllowed(protocol, allowedProtocols) {
    return allowedProtocols.includes(protocol);
}

/**
 * Reads a file or directory using the file:// scheme, respecting a whitelist for files.
 * Directories are always readable (returns a JSON list of contents).
 * Files are only readable if their absolute normalized path is in the whitelist.
 *
 * @param {string} pathname - The path part of the file:// URL.
 * @param {string[]} whitelist - List of absolute file paths that are allowed.
 * @returns {Promise<string>} - File content (UTF-8) or directory listing (JSON).
 * @throws {Error} - If the path does not exist, is neither file nor directory,
 *                   or if a file is not whitelisted.
 */
async function fileScheme_readFile(pathname, whitelist) {
    // Normalize the path to resolve '.' and '..' and ensure absolute consistency
    const normalizedPath = path.normalize(pathname);

    let stats;
    try {
        stats = await fs.stat(normalizedPath);
    } catch (err) {
        // If the file/directory does not exist, re-throw a clear error
        throw new Error(`Cannot access path "${normalizedPath}": ${err.message}`);
    }

    if (stats.isDirectory()) {
        // Directory listing: return JSON with the directory path and its entries
        const entries = await fs.readdir(normalizedPath);
        return JSON.stringify({
            directory: normalizedPath,
            contents: entries
        }, null, 2);
    } else if (stats.isFile()) {
        // File access: must be explicitly whitelisted
        if (whitelist.includes(normalizedPath)) {
            return await fs.readFile(normalizedPath, 'utf8');
        } else {
            throw new Error(`Access denied. Path "${normalizedPath}" is not allowed.`);
        }
    } else {
        // Neither file nor directory (e.g., device, socket, etc.)
        throw new Error(`Path "${normalizedPath}" is not a regular file or directory.`);
    }
}

/**
 * Validates the authority component (host) against blacklist and whitelist.
 * Blacklist takes precedence: if host is blacklisted, an error is thrown immediately.
 * If a whitelist is non‑empty, the host must be present in it.
 *
 * @param {Object} authority - Parsed authority object (username, password, host, port).
 * @param {Object} config - Level configuration (contains hostBlacklist, hostWhitelist).
 * @throws {Error} - If host is blacklisted or not whitelisted (when whitelist is non‑empty).
 */
function validateAuthority(authority, config) {
    // Blacklist check (if blacklist is non‑empty and contains the host)
    if (config.hostBlacklist.length > 0 && config.hostBlacklist.includes(authority.host)) {
        console.log("[validateAuthority] Host in blacklist");
        throw new Error(`Host "${authority.host}" is blacklisted.`);
    }

    // Whitelist check (only if whitelist is non‑empty)
    if (config.hostWhitelist.length > 0 && !config.hostWhitelist.includes(authority.host)) {
        console.log("[validateAuthority] Host not allowed by whitelist");
        throw new Error(`Host "${authority.host}" not allowed.`);
    }
}

/**
 * Performs an HTTP/HTTPS request using the fetch API, respecting level configuration.
 * Applies double‑encoding handling, authority validation, and an optional localhost guard.
 *
 * @param {Object} parsedUrl - RFC3986 parsed URL object.
 * @param {Object} config - Level configuration (protocols, whitelists, doubleEncoding).
 * @param {string} level - Current level identifier (used for internal server header).
 * @returns {Promise<string>} - Response body as text.
 * @throws {Error} - If validation fails, request fails, or response is not OK.
 */
async function httpScheme_fetch(parsedUrl, config, level) {
    // If double‑encoding protection is disabled for this level,
    // the URL may have been double‑encoded. Decode once before checking.
    if (!config.doubleEncoding) {
        console.log("[httpScheme_fetch] inside the if");
        const decodedUrl = decodeURIComponent(parsedUrl.authority);
        console.log("[httpScheme_fetch] decodedUrl: " + JSON.stringify(decodedUrl));
        parsedUrl.authority = decodedUrl;
    } 
    // Parse the authority (username:password@host:port)
    let authority = urlUtils.parseAuthority(parsedUrl.authority);
    console.log(`[httpScheme_fetch] Parsed authority: ${JSON.stringify(authority)}`);

    // Validate host against blacklist/whitelist
    validateAuthority(authority, config);

    // Rebuild the full URL for fetch
    const fullUrl = `${parsedUrl.scheme}://${parsedUrl.authority}${parsedUrl.path}${parsedUrl.query ? '?' + parsedUrl.query : ''}`;

    // Prepare fetch options
    const fetchOptions = {};

    // If the target is the internal server (127.0.0.1), add a header with the current level.
    if (authority.host === '127.0.0.1') {
        fetchOptions.headers = {
            'X-Current-Level': level
        };
    }

    const response = await fetch(fullUrl, fetchOptions);
    if (!response.ok) {
        const errorDetail = await response.text();
        throw new Error(errorDetail);
    }
    return await response.text();
}

// ======================== Exported Function ========================

/**
 * Main SSRF handler. Processes a user‑supplied URL according to the rules
 * defined for a specific level.
 *
 * @param {string} url - The full URL (payload) to process.
 * @param {string} level - The level identifier (e.g., "level_1").
 * @returns {Promise<string>} - The result (file content, HTTP response, etc.).
 * @throws {Error} - If the URL scheme is not allowed, config missing, or any validation fails.
 */
async function handleURL(url, level) {
    console.log(`[handleURL] Input URL: ${url}`);

    // Load the level configuration
    const config = configUtils.parseConfig(level);

    // Parse the URL according to RFC 3986
    const parsedUrl = urlUtils.RFC3986_URLParser(url);
    console.log(`[handleURL] Parsed URL: ${JSON.stringify(parsedUrl)}`);

    // 1. Check if the protocol is allowed
    if (!isProtocolAllowed(parsedUrl.scheme, config.protocol)) {
        throw new Error(`Protocol "${parsedUrl.scheme}" is not allowed.`);
    }

    // 2. Dispatch to the appropriate handler based on the scheme
    switch (parsedUrl.scheme) {
        case 'file':
            return await fileScheme_readFile(parsedUrl.path, config.fileWhitelist);
        case 'http':
        case 'https':
            return await httpScheme_fetch(parsedUrl, config, level);
    }
}

module.exports = { handleURL };