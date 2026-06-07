'use strict';

const ipUtils = require('../utils/ip');
const urlUtils = require('../utils/url_utils');

/**
 * Handles http:// and https:// requests.
 *
 * The outgoing URL is rebuilt from ctx.authority (which may have been
 * normalised by defenses) rather than from the raw input, so that e.g.
 * a decimal IP is converted to dotted-quad before the actual fetch.
 *
 * When the target resolves to a loopback address, an X-Current-Level header
 * is injected so the internal server knows which level is being exercised.
 *
 * @param {Object} ctx - Pipeline context ({ parsedUrl, authority }).
 * @param {Object} config - Level configuration.
 * @param {string} level - Level identifier (e.g. "level_1").
 * @returns {Promise<string>} Response body text.
 */
async function httpHandler({ parsedUrl, authority }, _config, level) {
    // Rebuild the authority from the (possibly normalised) authority object
    // so the outgoing URL reflects any changes made by defenses.
    const rebuiltAuthority = urlUtils.buildAuthority(authority);
    console.log(`[httpHandler] Rebuilt authority: ${JSON.stringify(rebuiltAuthority, null, 2)}`);
    const outgoingUrl = urlUtils.rebuildUrl({
        ...parsedUrl, // ... -> spread operator: copy all the properies of parsedUrl into the newly created object
        authority: rebuiltAuthority, // but substitute the autority field with the rebuilt authority
    });
    console.log(`[httpHandler] → ${outgoingUrl}`);

    // ── Loopback detection (best-effort) ───────────────────────────────────────
    // We try to resolve the host in ctx.authority (which has been normalised by
    // defenses). On levels where encoding bypasses are in play the host string
    // may still be percent-encoded here; in that case resolution will fail and
    // we simply skip the header — the request still goes through.
    let targetIsLoopback = false;
    try { 
        console.log(`[httpHandler] authority.host: ${authority.host}`);
        const host = decodeURIComponent(authority.host);
        console.log(`[httpHandler] host: ${host}`);
        const resolved = await ipUtils.resolveHost(host);
        console.log(`[httpHandler] resolved host: ${JSON.stringify(resolved, null, 2)}`);
        targetIsLoopback = ipUtils.isLoopback(resolved.address);
        console.log(`[httpHandler] is loopback address? ${targetIsLoopback}`);
    } catch {
        // Non-critical: resolveHost can fail for encoded/synthetic addresses.
        // The outgoing fetch will still work because Node's WHATWG URL parser
        // decodes percent-encoding internally.
    }

    const cleanUrl = urlUtils.stripCredentials(outgoingUrl);
    console.log(`clean url: ${cleanUrl}`);

    const fetchOptions = targetIsLoopback ? { 
          headers: { 
              'X-Current-Level': level,
              'Authorization': 'Basic ' + Buffer.from(`${authority.username}:${authority.password}`).toString('base64'),
          } 
      } : {};
    console.log(`fetch options: ${JSON.stringify(fetchOptions, null, 2)}`);

    // ── Send the request ───────────────────────────────────────────────────────
    let response;
    try {
        response = await fetch(cleanUrl, fetchOptions);
    } catch (err) {
        // Surface connection errors (e.g. ECONNREFUSED on wrong port) so that
        // students can distinguish a closed port from an open one during port
        // scanning in level 6.
        throw new Error(`Connection failed: ${err.message}`);
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`Upstream error - ${response.status}: ${detail}`);
    }

    return response.text();
}

module.exports = httpHandler;