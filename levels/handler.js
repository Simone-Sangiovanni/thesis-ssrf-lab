const fs = require('fs').promises;
const path = require('path');
const ipaddr = require('ipaddr.js');
const dns = require('dns').promises;

const ip = require('../utils/ip.js');
const configUtils = require('../utils/config_utils.js');
const urlUtils = require('../utils/url_utils.js');

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
    console.log("\nnormalized path: " + normalizedPath);

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
        console.log("\n[validateAuthority] Host in blacklist");
        throw new Error(`Host "${authority.host}" is blacklisted.`);
    }

    // Whitelist check (only if whitelist is non‑empty)
    if (config.hostWhitelist.length > 0 && !config.hostWhitelist.includes(authority.host)) {
        console.log("\n[validateAuthority] Host not allowed by whitelist");
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
        console.log("\n[httpScheme_fetch] Not vulnerable to double encoding");
        const decodedAuthority = decodeURIComponent(parsedUrl.authority);
        console.log("\n[httpScheme_fetch] Decoded authority: " + JSON.stringify(decodedAuthority));
        parsedUrl.authority = decodedAuthority;
    } 

    // Parse the authority (username:password@host:port)
    let authority = urlUtils.parseAuthority(parsedUrl.authority);
    console.log(`\n[httpScheme_fetch] Parsed authority: ${JSON.stringify(authority)}`);

    // Vulnerable part: decode before validation
    // Validate autority against blacklist/whitelist
    validateAuthority(authority, config);
    const decodedAuthority = decodeURIComponent(parsedUrl.authority);
    parsedUrl.authority = decodedAuthority;
    authority = urlUtils.parseAuthority(parsedUrl.authority);

    const address = await ip.resolveHost(authority.host);
    console.log("\nresolved address: " + JSON.stringify(address));

    // Rebuild the full URL for fetch
    const fullUrl = `${parsedUrl.scheme}://${parsedUrl.authority}${parsedUrl.path}${parsedUrl.query ? '?' + parsedUrl.query : ''}`;
    console.log("\nrebuilt URL: " + fullUrl);

    // Prepare fetch options
    const fetchOptions = {};

    // If the target is the internal server (127.0.0.1), add a header with the current level.
    if (ip.isLoopback(address.address)) {
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
    console.log("\n==============================================");
    console.log("\n==============================================");

    console.log(`\n[handleURL] Input URL: ${url}`);

    // Load the level configuration
    const config = configUtils.parseConfig(level);
    console.log(`\n[handleURL] Parsed config: ${JSON.stringify(config)}`);

    // Parse the URL according to RFC 3986
    const parsedUrl = urlUtils.RFC3986_URLParser(url);
    console.log(`\n[handleURL] Parsed URL: ${JSON.stringify(parsedUrl)}`);

    // 1. Check if the protocol is allowed
    if (!isProtocolAllowed(parsedUrl.scheme, config.protocol)) {
        console.log(`\n[handleURL] Protocol not allowed: ${JSON.stringify(parsedUrl.scheme)}`);
        throw new Error(`Protocol "${parsedUrl.scheme}" is not allowed.`);
    }

    // 2. Dispatch to the appropriate handler based on the scheme
    switch (parsedUrl.scheme) {
        case 'file':
            return await fileScheme_readFile(parsedUrl.path, config.fileWhitelist);
        case 'http':
        case 'https':
            return await httpScheme_fetch3(parsedUrl, config, level);
    }
}

module.exports = { handleURL };




async function httpScheme_fetch2(parsedUrl, config, level) {
    // decode
    const decodedAuthority = decodeURIComponent(parsedUrl.authority);
    console.log(`\n decodedAuthority: ${decodedAuthority}`);

    // resolve
    const authority = urlUtils.parseAuthority(decodedAuthority);
    console.log(`\n authority: ${JSON.stringify(authority)}`);
    const resolvedHost = await ip.resolveHost(authority.host);
    console.log(`\n resolved host: ${JSON.stringify(resolvedHost)}`);
    authority.host = resolvedHost.address;
    console.log(`\n authority: ${JSON.stringify(authority)}`);

    // check
    validateAuthority(authority, config);

    //rebuild
    const fullUrl = `${parsedUrl.scheme}://${decodedAuthority}${parsedUrl.path}${parsedUrl.query ? '?' + parsedUrl.query : ''}`;
    console.log(`\n fullurl: ${fullUrl}`);
    const fetchOptions = {};
    if (ip.isLoopback(authority.host)) {
        fetchOptions.headers = {
            'X-Current-Level': level
        };
    }

    // fetch
    const response = await fetch(fullUrl, fetchOptions);
    if (!response.ok) {
        const errorDetail = await response.text();
        throw new Error(errorDetail);
    }
    return await response.text();
}




async function httpScheme_fetch3(parsedUrl, config, level) {
    if(!config.doubleEncoding) {
        // decode
        const decodedAuthority = decodeURIComponent(parsedUrl.authority);
        console.log(`\n decodedAuthority: ${decodedAuthority}`);
        parsedUrl.authority = decodedAuthority;
    }
    
    const authority = urlUtils.parseAuthority(parsedUrl.authority);
    console.log(`\n authority: ${JSON.stringify(authority)}`);

    // check
    validateAuthority(authority, config);

    parsedUrl.authority = decodeURIComponent(authority.host);
    console.log(`\n decoded authority: ${parsedUrl.authority}`);

    // resolve
    const result = parsedUrl.authority.replace(/[\[\]]/g, '');
    const resolvedHost = await ip.resolveHost(result);
    authority.host = resolvedHost.address;

    //rebuild
    const fullUrl = `${parsedUrl.scheme}://${parsedUrl.authority}${parsedUrl.path}${parsedUrl.query ? '?' + parsedUrl.query : ''}`;
    console.log(`\n fullurl: ${fullUrl}`);
    const fetchOptions = {};
    if (ip.isLoopback(authority.host)) {
        fetchOptions.headers = {
            'X-Current-Level': level
        };
    }

    // fetch
    const response = await fetch(fullUrl, fetchOptions);
    if (!response.ok) {
        const errorDetail = await response.text();
        throw new Error(errorDetail);
    }
    return await response.text();
}