const fs = require('fs').promises;
const path = require('path');
const ipaddr = require('ipaddr.js');
const dns = require('dns').promises;

const configUtils = require('../utils/config_utils.js');
const urlUtils = require('../utils/url_utils.js');

// TODO: understand, comment and refactor
async function isLocalHost(hostname) {
    try {
        // dns.lookup con { all: true } interroga il sistema operativo (esattamente come fetch)
        // Se "hostname" è già un IP, ritornerà quell'IP.
        // Se è un dominio, ritornerà TUTTI gli IP (IPv4 e IPv6) a cui punta.
        const addresses = await dns.lookup(hostname, { all: true });

        // Controlliamo se ALMENO UNO degli IP risolti è privato/locale
        return addresses.some(record => isPrivateIp(record.address));

    } catch (error) {
        // FAIL CLOSED: Se la risoluzione fallisce (es. host non esiste, timeout DNS),
        // assumiamo che sia pericoloso e blocchiamo. Questo evita bypass imprevisti.
        console.warn(`[SSRF Guard] DNS resolution failed for ${hostname}:`, error.message);
        return true; // Ritorna true per indicare "Sì, bloccalo"
    }
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
    // Host blacklist check
    if (config.hostBlacklist.includes(element) && config.hostBlacklist.length > 0) {
        console.log("\nHost in blacklist");
        throw new Error(`Host "${element}" is blacklisted.`);
    }

    // Host whitelist check (only if it contain elements)
    if (config.hostWhitelist.length > 0) {
        if (!config.hostWhitelist.includes(element)) {
            console.log("\nHost not allowed by whitelist");
            throw new Error(`Host "${element}" not allowed.`);
        }
    }
}

// TODO: add docstrings and comments
async function httpScheme_fetch(parsed_url, config, level) {
    // TODO: block the url "http://127.0.0.1/flags/level_1" in level_1: the user must be ablo to read the content of /flags folder and the rest, 
    // but shold not be able to read the file using the http protocol. https is not implemented for the internal server so there is no need to 
    // protect against it
    const parsed_authority = urlUtils.parseAuthority(parsed_url.authority);
    console.log("\nparsed authority: " + JSON.stringify(parsed_authority));

    let hostToCheck = parsed_authority.host;

    if (config.doubleEncoding) {
        // execute checks on host here
        // checks are done before decoding the host
        // this is the vulnerable part
        hostToCheck = parsed_authority.host;
    } else {
        // if the level is not vulnerable to double encoding
        // checks are executed after the decoding
        hostToCheck = decodeURIComponent(parsed_authority.host);
    }

    check(hostToCheck, config);

    // SSRF guard: block local / private hosts
    // const local = await isLocalHost(parsed_authority.host);
    // if (local) {
    //     console.log("\nLocal ip: blocked")
    //     throw new Error(`Access to local/internal host "${parsed_authority.host}" is blocked.`);
    // }

    // TODO: do I need this?
    // parsed_authority.host = decodeURIComponent(parsed_authority.host);

    const fullUrl = `${parsed_url.scheme}://${parsed_url.authority}${parsed_url.path}${parsed_url.query ? '?' + parsed_url.query : ''}`;
    // Prepare fetch options
    const fetchOptions = {};
    // If the target is the internal server (localhost), add the level header
    const targetHost = parsed_authority.host;
    if (targetHost === '127.0.0.1') {
        fetchOptions.headers = {
            'X-Current-Level': level
        };
    }
    const response = await fetch(fullUrl, fetchOptions);
    if (!response.ok) throw new Error(`HTTP fetch failed: ${response.status}`);
    return await response.text();
}

/**
 * Main function
 * @param {string} url: vulnerable url. It is the payload 
 * @returns {Promise<any>}: a promise that resolves to a flag
 */
async function handleURL(url, level) {
    // get the config for the level
    console.log("\nurl: " + url);
    const config = configUtils.parseConfig(level);
    // parse the url and get an object
    const parsed_url = urlUtils.RFC3986_URLParser(url);
    console.log("\nparsed_url url: " + JSON.stringify(parsed_url));

    // if the protocol is not allowed throw an error
    if (!checkProtocol(parsed_url.scheme, config.protocol)) {
        throw new Error(`Protocol "${parsed_url.scheme}" is not allowed.`);
    } 

    switch (parsed_url.scheme) {
        case "file":
            return await fileScheme_readFile(parsed_url.path, config.fileWhitelist);
            break;
        case "http":
        case "https":
            return await httpScheme_fetch(parsed_url, config, level)
            break;
    }
}

// exports the handleURL function so it can be used by other modules
module.exports = { handleURL };