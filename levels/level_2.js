const fs = require('fs');
const path = require('path');


const FILE_WHITELIST = new Set([
    '/flags/level_2'
]);

const IP_BLACKLIST = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '127.1'
];


function get_protocol(url) {
    const m = url.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*:\/\/)/);
    if (!m) throw new Error('Protocol not found');
    return m[1];
}

function get_host(url) {
    const m = url.match(/^[^:]+:\/\/([^/:]+)/);
    if (!m) throw new Error('Host not found');
    return m[1];
}

function get_port(url) {
    const m = url.match(/^[^:]+:\/\/[^/:]+:(\d+)/);
    return m ? m[1] : null;
}

function get_path(url) {
    const m = url.match(/^[^:]+:\/\/[^/]+(\/.*)?$/);
    return m ? (m[1] || '/') : '/';
}


async function handleURL(url) {
    const lowerUrl = url.toLowerCase();
    for (const blocked of IP_BLACKLIST) {
        if (lowerUrl.includes(blocked)) {
            throw new Error(`Access denied: host "${blocked}" is in the blacklist.`);
        }
    }

    // ---- vulnerable part -------------------------------------------------------
    //let decodedUrl;
    //try {
    //    decodedUrl = decodeURIComponent(url);
    //} catch {
    //    throw new Error('Malformed URL: unable to decode.');
    //}
    // -----------------------------------------------------------------------------
    const urlObj = new URL(url); // second decode here
    const protocol = urlObj.protocol;
    const host = urlObj.host;
    const filePath = urlObj.pathname;

    if (protocol !== 'http:' && protocol !== 'https:') {
        throw new Error(`Protocollo not supported: ${protocol}`);
    }

    // Fetch con il vero URL decodificato (qui avviene l'SSRF)
    const response = await fetch(urlObj, {
        method:  'GET',
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
    });

    /**
     * Now local and remote hosts are threated the same way.
     * No whitelist check is done on local fetches so the user can read all the files
     */

    console.log(response)

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();

    // Ritorna testo o JSON
    if (contentType.includes('application/json')) {
        return JSON.stringify(JSON.parse(body), null, 2);
    }
    return body;
}

module.exports = { handleURL };