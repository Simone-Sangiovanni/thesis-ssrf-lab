'use strict';

const dns = require('dns').promises;
const ipaddr = require('ipaddr.js');

// ─── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolves a hostname or IP string to a canonical address object.
 * IPv6 bracket notation is accepted (brackets are stripped before parsing).
 *
 * Returns { address: string, family: 'ipv4' | 'ipv6' }.
 * Throws if the host cannot be resolved.
 */
async function resolveHost(host) {
	const clean = stripBrackets(host);

	// Direct IP parse (avoids unnecessary DNS round-trip)
	try {
		const parsed = ipaddr.parse(clean);
		return { address: parsed.toString(), family: parsed.kind() };
	} catch { /* not a bare IP string — fall through to DNS */ }

	const result = await dns.lookup(clean/*, { verbatim: true }*/);
	return {
		address: result.address,
		family:  result.family === 4 ? 'ipv4' : 'ipv6',
	};
}

/**
 * Returns true if `address` is a loopback address.
 * Handles both IPv4 (127.x.x.x) and IPv6 (::1) loopback, and also
 * IPv4-mapped IPv6 loopback (::ffff:127.0.0.1).
 */
function isLoopback(address) {
	try {
		const parsed = ipaddr.parse(address);
		// Unwrap IPv4-mapped IPv6 before the range check
		if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
			return parsed.toIPv4Address().range() === 'loopback';
		}
		return parsed.range() === 'loopback';
	} catch {
		return false;
	}
}

// ─── Alternate IPv4 representation normalisation ──────────────────────────────

/**
 * Converts a single numeric string that may be:
 *   - hex (0x… prefix)
 *   - octal (leading zero, e.g. 0177)
 *   - decimal
 * …to a JavaScript number, or NaN if it doesn't match any of these forms.
 */
function parseIntPart(s) {
	if (/^0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
	if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);
	if (/^\d+$/.test(s)) return parseInt(s, 10);
	return NaN;
}

/** Converts a 32-bit unsigned integer to dotted-quad IPv4 notation. */
function intToIPv4(n) {
	return [
		(n >>> 24) & 0xff,
		(n >>> 16) & 0xff,
		(n >>> 8) & 0xff,
		n & 0xff,
	].join('.');
}

/**
 * Normalises alternate IPv4 representations to standard dotted-quad.
 *
 * Handles:
 *   2130706433        (single decimal)   → 127.0.0.1
 *   0x7f000001        (single hex)       → 127.0.0.1
 *   017700000001      (single octal)     → 127.0.0.1
 *   0x7f.0x0.0x0.0x1 (dotted hex)       → 127.0.0.1
 *   0177.0.0.01       (dotted octal)     → 127.0.0.1
 *   127.0.0.1         (already normal)   → 127.0.0.1  (unchanged)
 *
 * Returns the input unchanged if it doesn't match any alternate form.
 * Does NOT touch IPv6 addresses.
 */
function normalizeIpRepresentation(host) {
	// Skip IPv6 addresses (they contain colons or brackets)
	if (host.includes(':') || host.startsWith('[')) return host;

	// ── Single-part integer (decimal, hex, or octal) ──────────────────────────
	if (/^(0[xX][0-9a-fA-F]+|0[0-7]+|\d+)$/.test(host)) {
		const n = parseIntPart(host);
		if (!isNaN(n) && n >= 0 && n <= 0xffffffff) return intToIPv4(n);
	}

	// ── Dotted four-part form (each octet may be dec/hex/oct) ─────────────────
	const parts = host.split('.');
	if (parts.length === 4) {
		const octets = parts.map(parseIntPart);
		if (octets.every(o => !isNaN(o) && o >= 0 && o <= 255)) {
			return octets.join('.');
		}
	}

	return host; // unchanged
}

/**
 * If `host` is an IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 or
 * [::ffff:7f00:1]), returns the embedded IPv4 address string.
 * Otherwise returns `host` unchanged.
 *
 * This lets the blacklist catch IPv4-mapped IPv6 addresses that encode a
 * blocked IPv4 address.
 */
function extractIpv4FromMappedIpv6(host) {
	try {
		const parsed = ipaddr.parse(stripBrackets(host));
		if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
			return parsed.toIPv4Address().toString();
		}
	} catch { /* not a parseable IP */ }
	return host;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripBrackets(host) {
	return host.startsWith('[') && host.endsWith(']')
		? host.slice(1, -1)
		: host;
}

module.exports = {
  	resolveHost,
  	isLoopback,
  	normalizeIpRepresentation,
  	extractIpv4FromMappedIpv6,
};