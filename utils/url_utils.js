'use strict';

// ─── RFC 3986 URL parsing ─────────────────────────────────────────────────────

/**
 * Parses a URL string into its RFC 3986 components.
 *
 * Returns { scheme, authority, path, query, fragment }.
 * Any component not present in the URL is null (except path, which is '').
 */
function RFC3986_URLParser(url) {
    // Appendix B regex from RFC 3986
    const match = url.match(
        /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/
    );
    if (!match) throw new Error(`Malformed URL: "${url}"`);

    return {
        scheme:    match[1] ?? null,
        authority: match[2] ?? null,   // null when there is no // in the URL
        path:      match[3] ?? '',
        query:     match[4] ?? null,
        fragment:  match[5] ?? null,
    };
}

// ─── Authority parsing and building ──────────────────────────────────────────

/**
 * Parses an authority string — [username:password@]host[:port] — into its parts.
 *
 * Handles IPv6 literals enclosed in brackets (e.g. [::1], [::ffff:127.0.0.1]).
 * The brackets are kept as part of the returned `host` string so that
 * rebuilding the authority is unambiguous.
 *
 * Returns { username: string|null, password: string|null host: string, port: number|null }.
 */
function parseAuthority(authority) {
    if (!authority) return { username: null, password: null, host: '', port: null };

    // ── Extract userinfo ──────────────────────────────────────────────────────
    let userinfo = null;
    let hostPort  = authority;
    const atIdx = authority.indexOf('@');
    if (atIdx !== -1) {
        userinfo = authority.slice(0, atIdx);
        hostPort = authority.slice(atIdx + 1);
    }


    // ── Extract username and password ─────────────────────────────────────────────────
    let username = null, password = null;

    if(userinfo !== null) {
        const colonIdx = userinfo.indexOf(':');
        if(colonIdx !== -1) {
            username = userinfo.slice(0, colonIdx);
            password = userinfo.slice(colonIdx + 1);
        } else {
            username = userinfo;
        }
        if(username === "") username = null;
    }

    // ── Extract host and port ─────────────────────────────────────────────────
    let host = null, port = null;

    if (hostPort.startsWith('[')) {
        // IPv6 literal: [::1] or [::ffff:127.0.0.1]:8080
        const close = hostPort.indexOf(']');
        if (close === -1) throw new Error(`Unclosed IPv6 bracket in authority: "${authority}"`);
        host = hostPort.slice(0, close + 1);          // keep brackets
        const rest = hostPort.slice(close + 1);
        if (rest.startsWith(':')) port = rest.slice(1) || null;
    } else {
        const colon = hostPort.lastIndexOf(':');
        if (colon !== -1) {
            const maybePort = hostPort.slice(colon + 1);
            if (/^\d+$/.test(maybePort)) {              // only split on a numeric port
                host = hostPort.slice(0, colon);
                port = maybePort;
            } else {
                host = hostPort;
            }
        } else {
            host = hostPort;
        }
    }

    return {
        username,
        password,
        host,
        port: port !== null ? parseInt(port, 10) : null,
    };
}

/**
 * Rebuilds an authority string from its parsed components.
 * Adds IPv6 brackets when the host contains a colon but no brackets yet.
 */
function buildAuthority({ username, password, host, port }) {
    let h = host;
    // Wrap bare IPv6 addresses in brackets
    if (h.includes(':') && !h.startsWith('[')) h = `[${h}]`;

    let authority = h;
    if (port !== null) authority = `${authority}:${port}`;

    let userinfo = null;
    if(username !== null) userinfo = username;
    if(password !== null) userinfo = [userinfo, password].join(':');

    if (userinfo !== null) authority = `${userinfo}@${authority}`;
    return authority;
}

/**
 * Rebuilds a full URL string from a parsed URL object.
 * Uses the current values — which may differ from the original if defenses
 * have mutated the authority object.
 */
function rebuildUrl({ scheme, authority, path, query, fragment }) {
    let url = '';
    if (scheme) url += scheme + ':';
    if (authority != null) url += '//' + authority;
    url += path ?? '';
    if (query != null) url += '?' + query;
    if (fragment != null) url += '#' + fragment;
    return url;
}

/**
 * Removes credentials (username:password) from a URL string.
 * Works with both IPv4 and IPv6 addresses, as well as hostnames.
 * Uses the WHATWG URL API, which is available in Node.js and modern browsers.
 *
 * @param {string} url - The URL to clean (e.g., 'http://alfred:qwert@127.0.0.1/secretPath')
 * @returns {string} - The same URL without any credentials, or the original if parsing fails.
 */
function stripCredentials(url) {
    try {
        // Attempt to parse the URL. The constructor works for absolute URLs with a scheme.
        const urlObj = new URL(url);
        
        // If either username or password is present, clear both.
        if (urlObj.username || urlObj.password) {
            urlObj.username = '';
            urlObj.password = '';
            return urlObj.toString();
        }
        // No credentials to strip
        return url;
    } catch {
        // If the URL is malformed or relative, return it unchanged.
        // In practice, you might also try to prefix a dummy scheme, but the problem
        // context expects valid absolute URLs (e.g., from an HTTP request line).
        return url;
    }
}

module.exports = { RFC3986_URLParser, parseAuthority, buildAuthority, rebuildUrl, stripCredentials };