/**
 * Parses a URL string strictly according to RFC 3986 Appendix B.
 * Returns an object with the components: scheme, authority, path, query, fragment.
 * Does NOT further break down authority into user, host, or port.
 * @param {string} url: url to parse
 * @returns {Object}: object containing the elements of the url (schema, autority, path, query, fragment)
 */
function RFC3986_URLParser(url) {
    // Regex from RFC 3986, Appendix B
    const regex = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
    const match = url.match(regex);

    if (!match) {
        throw new Error('Invalid URL');
    }

    // Destructure the capture groups:
    // 0: full match       (skip)
    // 1: scheme + colon   (skip)
    // 2: scheme name      -> scheme
    // 3: "//" + authority (skip)
    // 4: authority        -> authority
    // 5: path             -> path
    // 6: "?" + query      (skip)
    // 7: query            -> query
    // 8: "#" + fragment   (skip)
    // 9: fragment         -> fragment
    const [
        ,          // 0
        ,          // 1
        scheme,    // 2
        ,          // 3
        authority, // 4
        path,      // 5
        ,          // 6
        query,     // 7
        ,          // 8
        fragment   // 9
    ] = match; // this return just the data I need

    return {
        scheme:   scheme || '',
        authority: authority || '',
        path:     path || '',
        query:    query || '',
        fragment: fragment || ''
    };
}

/**
 * Get a string (the URL authority) and split it into its components
 * @param {string} authority: string containg the autority part (username:password@host:port) 
 * @returns {Object}: parsed autority
 */
function parseAuthority(authority) {
    // Regex breakdown:
    // ^(?:([^:]+):([^@]+)@)?   - optional username:password@
    // (?:\[([^\]]+)\]|([^:]+)) - IPv6 in brackets OR normal hostname/IPv4
    // (?::(\d+))?$             - optional port number
    const regex = /^(?:([^:]+):([^@]+)@)?(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/;
    const match = authority.match(regex);

    if (!match) {
        throw new Error('Invalid authority format (expected: [username:password@]host[:port])');
    }

    return {
        username: match[1] || null,
        password: match[2] || null,
        host: match[3] || match[4],
        port: match[5] || null
    };
}

module.exports = { RFC3986_URLParser, parseAuthority };