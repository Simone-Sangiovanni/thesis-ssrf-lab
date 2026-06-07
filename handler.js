// directive that enables strict mdode: the code is executed in a stricter parsing and error-handling mode, preventing the use of 
// certain error-prone or legacy features
'use strict';

const { BlockedError, ConfigError, UrlError } = require('./utils/errors');
const { loadConfig } = require('./utils/config_utils');
const urlUtils = require('./utils/url_utils');
const defenses = require('./defenses/defenses');
const fileHandler = require('./handlers/file');
const httpHandler = require('./handlers/http');

/**
 * Maps URL schemes to their protocol handler functions.
 * Add entries here to support new schemes (e.g. gopher://).
 */
const protocolHandlers = {
  file: fileHandler,
  http: httpHandler,
  https: httpHandler,
};

/**
 * Main SSRF handler.
 *
 * Orchestrates:
 *   1. Config loading for the given level.
 *   2. RFC 3986 URL parsing.
 *   3. Running the level's defense pipeline (may throw BlockedError).
 *   4. Dispatching to the appropriate protocol handler.
 *
 * @param {string} url   - The attacker-supplied URL string.
 * @param {string} level - Level identifier (e.g. "level_1").
 * @returns {Promise<string>} Response body (file content or HTTP response).
 *
 * @throws {BlockedError} When a defense explicitly blocks the request.
 * @throws {ConfigError} When the level config references an unknown defense.
 * @throws {Error} On network failure, missing config file, etc.
 */
async function handleURL(url, level, config) {
  	console.log(`\n${'─'.repeat(60)}`);
  	console.log(`[handleURL] url="${url}"  level="${level}"`);

  	// ── 1. Load level config ─────────────────────────────────────────────────
  	console.log(`[handleURL] pipeline: [${config.pipeline.join(', ')}]`);

  	// ── 2. Parse the URL ─────────────────────────────────────────────────────
  	const parsedUrl = urlUtils.RFC3986_URLParser(url);
  	console.log(`[handleURL] parsed URL:`, parsedUrl);

  	if (!parsedUrl.scheme) {
		throw new UrlError('URL has no scheme');
  	}

  	// ── 3. Build shared, mutable context ────────────────────────────────────
  	//  Defenses receive this object and may mutate parsedUrl.authority and
  	//  authority.host / authority.port to normalise values for subsequent checks.
  	const authority = urlUtils.parseAuthority(parsedUrl.authority ?? ''); // ?? -> if parsedUrl.authority is 'null' or 'undefined' use an empty string
  	const ctx = { parsedUrl, authority };
  	console.log(`[handleUrl] context ctx: ${JSON.stringify(ctx, null, 2)}`);

  	// ── 4. Run defense pipeline ──────────────────────────────────────────────
  	for (const name of config.pipeline) {
		const defense = defenses[name];
		if (typeof defense !== 'function') {
		  throw new ConfigError(
			`Unknown defense "${name}" in pipeline for level "${level}". ` +
			`Available defenses: [${Object.keys(defenses).join(', ')}]`
		  );
		}
		console.log(`[pipeline] → ${name}`);
		await defense(ctx, config); // throws BlockedError to halt
  	}

  	// ── 5. Dispatch to protocol handler ─────────────────────────────────────
  	const protocol_handler = protocolHandlers[parsedUrl.scheme];
  	if (!protocol_handler) {
		// checkProtocol should have caught this; guard defensively
		throw new BlockedError(`No handler registered for scheme "${parsedUrl.scheme}"`);
  	}

  	return protocol_handler(ctx, config, level);
}	

module.exports = { handleURL };