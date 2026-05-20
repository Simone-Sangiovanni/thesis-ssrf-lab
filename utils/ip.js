const dns = require('dns').promises;
const net = require('net');

const loopbackIP = [
    "127.0.0.1",
    "127.1",
    "127.0.1",
    "0x7f.0x0.0x0.0x1",
    "0x7f.0.0.1",
    "0177.0.0.1",
    "0177.00.00.01",
    "2130706433",
    "0x7f000001",
    "017700000001",
    "0177.0.0.0x1",
    "127%2E0%2E0%2E1",
    "%31%32%37%2E%30%2E%30%2E%31",
    "127%252E0%252E0%252E1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1"
]

/**
 * Resolve the given host into an IP
 * @param {String} host: resolve host
 * @returns {Object} {ip, ip_version}
 */
async function resolveHost(host) {
    try { 
        return await dns.lookup(host);
    } catch (_) {
        throw new Error("Error: unable to resolve the host");
    }
}

/**
 * Check if the address ip is in the loopbackIP list
 * @param {String} address: ip 
 * @returns {boolean}
 */
function isLoopback(address) {
    if(loopbackIP.includes(address)) return true;
    return false;
}

module.exports = {resolveHost, isLoopback}