/**
 * Parses a URL strictly according to RFC 3986 Appendix B.
 * Returns the raw components without further decomposition of the authority.
 *
 * @param {string} url - The URL string to parse.
 * @returns {Object} Components: { scheme, authority, path, query, fragment }
 * @throws {Error} If the URL does not match the expected format.
 */
function RFC3986_URLParser(url) {
    // RFC 3986 Appendix B regex
    const regex = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
    const match = url.match(regex);

    if (!match) {
        throw new Error(`Invalid URL: "${url}" does not match RFC 3986 syntax`);
    }

    const [
        ,          // full match (unused)
        ,          // scheme + colon (unused)
        scheme,    // scheme name
        ,          // "//" + authority (unused)
        authority, // authority part
        path,      // path
        ,          // "?" + query (unused)
        query,     // query string
        ,          // "#" + fragment (unused)
        fragment   // fragment
    ] = match;

    return {
        scheme: scheme || '',
        authority: authority || '',
        path: path || '',
        query: query || '',
        fragment: fragment || ''
    };
}

/**
 * Breaks down the authority component of a URL into its sub‑parts.
 * Supports optional username:password, IPv4/IPv6 hosts, and optional port.
 *
 * @param {string} authority - The authority string (e.g., "user:pass@[::1]:8080")
 * @returns {Object} { username, password, host, port }
 * @throws {Error} If the authority format is invalid.
 */
function parseAuthority(authority) {
    // Regex breakdown:
    // ^(?:([^:]+):([^@]+)@)?   optional username:password@
    // (?:\[([^\]]+)\]|([^:]+)) IPv6 in brackets OR normal hostname/IPv4
    // (?::(\d+))?$             optional port
    const regex = /^(?:([^:]+):([^@]+)@)?(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/;
    const match = authority.match(regex);

    if (!match) {
        throw new Error(`Invalid authority format: "${authority}" (expected [username:password@]host[:port])`);
    }

    return {
        username: match[1] || null,
        password: match[2] || null,
        host: match[3] || match[4],   // IPv6 (bracketed) or IPv4/hostname
        port: match[5] || null
    };
}

module.exports = { RFC3986_URLParser, parseAuthority };