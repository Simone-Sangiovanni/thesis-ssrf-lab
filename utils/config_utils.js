'use strict';

const fs = require('fs');
const path = require('path');
const state = require('../state');
const { ConfigError } = require('./errors');

const CONFIG_DIR = path.join(__dirname, '../config');

// Default port for the internal server (levels 1–5)
const DEFAULT_INTERNAL_PORT = 80;

// Port range for random selection (level 6)
const RANDOM_PORT_MIN = 5000;
const RANDOM_PORT_MAX = 25000;

/**
 * Loads and returns the parsed JSON configuration for `level`.
 *
 * Applies runtime overrides on top of the static JSON:
 *   - Levels with `"randomPort": true` receive a stable random port assigned
 *     on first access and reused for the lifetime of the process.
 *   - All other levels use `DEFAULT_INTERNAL_PORT`.
 *
 * Throws if the config file cannot be read or parsed.
 */
function loadConfig(level) {
  const configPath = path.join(CONFIG_DIR, `${level}.json`);

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new ConfigError(`Cannot load config for "${level}": ${err.message}`);
  }

  // Inject internalPort into the config object so handlers can use it
  if (config.randomPort) {
    if (!state.get(level, 'internalPort')) {
      const port = Math.floor(Math.random() * (RANDOM_PORT_MAX - RANDOM_PORT_MIN + 1)) + RANDOM_PORT_MIN;
      state.set(level, 'internalPort', port);
      console.log(`[config] Level "${level}" — random internal port assigned: ${port}`);
    }
    config.internalPort = state.get(level, 'internalPort');
  } else {
    config.internalPort = DEFAULT_INTERNAL_PORT;
  }

  delete config._comment;

  return config;
}

/**
 * Output example:
 * 
{
  "pipeline": [
    "checkProtocol",
    "decodeAuthority",
    "normalizeIpRepresentation",
    "checkHostBlacklist"
  ],
  "allowedProtocols": [
    "http",
    "https"
  ],
  "hostBlacklist": [
    "127.0.0.1",
    "localhost",
    "0.0.0.0",
    "::1"
  ],
  "hostWhitelist": [],
  "portBlacklist": [],
  "portWhitelist": [],
  "fileWhitelist": [],
  "randomPort": true,
  "internalPort": 40414
}
 */

module.exports = { loadConfig };