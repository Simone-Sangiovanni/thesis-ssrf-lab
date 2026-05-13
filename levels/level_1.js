const fs = require('fs').promises;
const path = require('path');
const ipaddr = require('ipaddr.js');
const dns = require('dns').promises;

const configUtils = require('../utils/config_utils.js');
const urlUtils = require('../utils/url_utils.js');

// TODO: understand, comment and refactor
async function isLocalHost(hostname) {
    if (ipaddr.isValid(hostname)) {
        // Already an IP literal
        return isPrivateIp(hostname);
    }

    let addresses = [];
    try {
        const ipv4 = await dns.resolve4(hostname).catch(() => []);
        const ipv6 = await dns.resolve6(hostname).catch(() => []);
        addresses = [...ipv4, ...ipv6];
    } catch {
        return false; // DNS failure → assume safe
    }

    return addresses.some(ip => isPrivateIp(ip));
}

// TODO: understand, comment and refactor
function isPrivateIp(ip) {
    try {
        const addr = ipaddr.parse(ip);
        if (addr.kind() === 'ipv4') {
            const r = addr.range();
            return r === 'private' || r === 'loopback' || r === 'linkLocal' || r === 'unspecified';
        }
        if (addr.kind() === 'ipv6') {
            // IPv4-mapped IPv6 (e.g., ::ffff:192.168.1.1)
            if (addr.isIPv4MappedAddress()) {
                const ipv4 = addr.toIPv4Address();
                const r = ipv4.range();
                return r === 'private' || r === 'loopback' || r === 'linkLocal' || r === 'unspecified';
            }
            const r = addr.range();
            return r === 'loopback' || r === 'linkLocal' || r === 'uniqueLocal';
        }
    } catch {
        // invalid IP string → not a local IP
    }
    return false;
}

/**
 * Check if the protocol is allowed or not, the check is made on top of the configuration file
 * @param {string} protocol: protocol used inside the url 
 * @param {list} allowed: list of the allowed protocols
 * @returns {boolean}: true if the protocol is allowed, false otherwhise
 */
function checkProtocol(protocol, allowed) {
    return allowed.includes(protocol)
}

/**
 * Use a path to read its content.
 * If the path is a directory list the content and return it.
 * If the path is a whitelisted file return it's content
 * If the file is not allowed throw an error
 * @param {string} pathname: pathname of the file to read 
 * @param {list} whitelist: list of the allowed files to read 
 * @returns {Promise<any>}: a promise that resolves in a file content if the file is allowed, or the content of the directory if pathname is a directory
 * @throws {Error}: if the file is not in the whitelist
 */
// TODO: if the folder does not exists throw an error, now this case is not handled
// TODO: if the pathname is not a file nor a directory throw an error, now this case is not managed
async function fileScheme_readFile(pathname, whitelist){
    const normalized = path.normalize(pathname); // expand . and .. into a full path
    const stat = await fs.stat(normalized); // get info about the path: directory or file
    if (stat.isDirectory()) {
        // Directory request → return contents as JSON
        const entries = await fs.readdir(normalized);
        return JSON.stringify({
            directory: normalized,
            contents: entries
        }, null, 2);
    } else {
        if (whitelist.includes(normalized)) {
            return await fs.readFile(normalized, 'utf8');
        } else {
            throw new Error(`Access denied. Path "${normalized}" is not allowed.`);
        }
    }
}

/**
 * Execute checks on the element passed. Verify if the element is present inside the configuration
 * @param {*} element: the element to check 
 * @param {list} config: the configuration
 * @returns {boolean}: true if the element is present inside the congiguration, false otherwhise
 */
function check(element, config) {
    // TODO
}

// TODO: add docstrings and comments
async function httpScheme_fetch(parsed_url, config) {
    if (config.doubleEncoding) {
        // execute checks on host here
        // checks are done before decoding the host
        // this is the vulnerable part
    } else {
        // if the level is not vulnerable to double encoding
        // checks are executed after the decoding
    }
    const parsed_authority = urlUtils.parseAuthority(parsed_url.authority);
    console.log("parsed authority: " + JSON.stringify(parsed_authority));

    // Host whitelist
    if (config.host.length && !config.host.includes(parsed_url.host)) {
        throw new Error(`Host "${parsed_url.host}" not allowed.`);
    }
    // Port check
    if (config.port.length && !config.port.includes(parsed_url.port || '')) {
        throw new Error(`Port "${parsed_url.port}" not allowed.`);
    }
    // SSRF guard: block local / private hosts
    const local = await isLocalHost(parsed_url.host);
    if (local) {
        throw new Error(`Access to local/internal host "${parsed_url.host}" is blocked.`);
    }

    const fullUrl = `${parsed_url.scheme}://${parsed_url.authority}${parsed_url.path}${parsed_url.query ? '?' + parsed_url.query : ''}`;
    const response = await fetch(fullUrl);
    if (!response.ok) throw new Error(`HTTP fetch failed: ${response.status}`);
    return await response.text();
}

/**
 * Main function
 * @param {string} url: vulnerable url. It is the payload 
 * @returns {Promise<any>}: a promise that resolves to a flag
 */
async function handleURL(url) {
    // get the config for the level
    console.log("url: " + url);
    const config = configUtils.parseConfig("level_1");
    console.log("step 1");
    // parse the url and get an object
    const parsed_url = urlUtils.RFC3986_URLParser(url);
    console.log("parsed_url url: " + JSON.stringify(parsed_url));

    // if the protocol is not allowed throw an error
    if (!checkProtocol(parsed_url.scheme, config.protocol)) {
        throw new Error(`Protocol "${parsed_url.scheme}" is not allowed.`);
    } 

    switch (parsed_url.scheme) {
        case "file":
            return await fileScheme_readFile(parsed_url.path, config.whitelist);
            break;
        case "http":
        case "https":
            return await httpScheme_fetch(parsed_url, config)
            break;
    }
}

// exports the handleURL function so it can be used by other modules
module.exports = { handleURL };