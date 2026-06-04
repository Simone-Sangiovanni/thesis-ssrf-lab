'use strict';

const { BlockedError } = require('../utils/errors');
const ipUtils  = require('../utils/ip');
const urlUtils = require('../utils/url_utils');

/**
 * Defense pipeline.
 *
 * Each defense is a (possibly async) function with the signature:
 *
 *   defense(ctx, config) → void  (throws BlockedError to halt the request)
 *
 * `ctx` is a shared mutable context created in handler.js:
 *   {
 *     parsedUrl: { scheme, authority: string, path, query, fragment },
 *     authority: { userinfo, host, port }
 *   }
 *
 * Defenses may mutate ctx to normalise values so that later defenses in the
 * same pipeline see the normalised form. The ordering of the `pipeline`
 * array in each level's JSON config is therefore significant.
 */

const defenses = {

  // ── Protocol ──────────────────────────────────────────────────────────────

  /**
   * Ensures the URL scheme is present in the config's allowedProtocols list.
   * This is the first check in every level's pipeline.
   */
  checkProtocol({ parsedUrl }, { allowedProtocols = [] }) {
    if (!parsedUrl.scheme || !allowedProtocols.includes(parsedUrl.scheme)) {
      throw new BlockedError(`Protocol "${parsedUrl.scheme}" is not allowed`);
    }
  },

  // ── Encoding ──────────────────────────────────────────────────────────────

  /**
   * Decodes the authority string once with decodeURIComponent before any
   * subsequent host checks, then re-parses ctx.authority from the result.
   *
   * Effect on attacks:
   *   ABSENT  → single-encoding bypass works (level 3 is vulnerable)
   *   PRESENT → single-encoding is caught; double-encoding still bypasses
   *             because the blacklist sees the once-decoded value, which is
   *             still encoded relative to the final URL the browser sends
   *
   * Levels: introduced at level 4.
   */
  decodeAuthority({ parsedUrl, authority }, _config) {
    const decoded = decodeURIComponent(parsedUrl.authority);
    parsedUrl.authority = decoded; // substitute the string "authority" inside the object "parsedUrl" inside the ctx
    Object.assign(authority, urlUtils.parseAuthority(decoded)); // reassign the "authority" object inside the ctx with the new decoded authority
    console.log(`[decodeAuthority] → "${decoded}"`);
  },

  // ── Host ──────────────────────────────────────────────────────────────────

  /**
   * Compares ctx.authority.host (as currently normalised by preceding
   * defenses) against the configured blacklist and optional whitelist.
   *
   * Vulnerable to any host representation that doesn't match the listed
   * strings literally (encoding, alternate number bases, IPv6 mapping, …).
   *
   * Levels: introduced at level 3.
   */
  checkHostBlacklist({ authority }, { hostBlacklist = [], hostWhitelist = [] }) {
    const { host } = authority;

    if (hostBlacklist.includes(host)) {
      throw new BlockedError(`Host "${host}" is blacklisted`);
    }
  },

  // ── IP representation normalisation ───────────────────────────────────────

  /**
   * Converts alternate IPv4 notations (decimal integer, hex, octal, mixed
   * dotted forms) to canonical dotted-quad before the blacklist check.
   *
   * Effect: prevents bypasses like 2130706433, 0x7f000001, 0177.0.0.01.
   * Still vulnerable to IPv4-mapped IPv6 (::ffff:127.0.0.1).
   *
   * Levels: introduced at level 5.
   */
  normalizeIpRepresentation({ authority }, _config) {
    const normalized = ipUtils.normalizeIpRepresentation(authority.host);
    if (normalized !== authority.host) {
      console.log(`[normalizeIpRepresentation] "${authority.host}" → "${normalized}"`);
      authority.host = normalized;
    }
  },

  /**
   * Unwraps IPv4-mapped IPv6 addresses (::ffff:127.0.0.1, [::ffff:7f00:1],
   * etc.) to their embedded IPv4 form so the blacklist check catches them.
   *
   * Effect: closes the IPv4-mapped IPv6 bypass.
   * Still vulnerable to: (nothing — this is the final IP-level fix).
   *
   * This defense is intentionally omitted from levels 5 and 6 so that
   * [::ffff:127.0.0.1] can be used as a bypass technique.
   */
  resolveIpv4MappedIpv6({ authority }, _config) {
    const resolved = ipUtils.extractIpv4FromMappedIpv6(authority.host);
    if (resolved !== authority.host) {
      console.log(`[resolveIpv4MappedIpv6] "${authority.host}" → "${resolved}"`);
      authority.host = resolved;
    }
  },

  // ── Port ──────────────────────────────────────────────────────────────────

  /**
   * Validates the request port against portBlacklist and portWhitelist.
   * Falls back to the scheme's standard port (80 / 443) when no port is
   * specified in the URL.
   *
   * Currently unused in levels 1–6 but available for custom level configs.
   */
  checkPort({ authority, parsedUrl }, { portBlacklist = [], portWhitelist = [] }) {
    const defaultPorts = { http: 80, https: 443 };
    const port = authority.port ?? defaultPorts[parsedUrl.scheme] ?? null;

    if (port === null) return; // nothing to check

    if (portBlacklist.includes(port)) {
      throw new BlockedError(`Port ${port} is blacklisted`);
    }
    if (portWhitelist.length > 0 && !portWhitelist.includes(port)) {
      throw new BlockedError(`Port ${port} is not in the whitelist`);
    }
  },
};

module.exports = defenses;