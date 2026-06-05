'use strict';

const fs = require('fs').promises;
const path = require('path');
const { BlockedError } = require('../utils/errors');

/**
 * Handles file:// requests.
 *
 * Rules:
 *   - Directories are always readable and return a JSON listing.
 *   - Files must be explicitly listed in config.fileWhitelist (checked
 *     against the normalised absolute path).
 *   - Any other path type (socket, device, …) is rejected.
 *
 * @param {Object} ctx - Pipeline context ({ parsedUrl, authority }).
 * @param {Object} config - Level configuration.
 * @returns {Promise<string>} File content or directory listing.
 */
async function fileHandler({ parsedUrl }, { fileWhitelist = [] }, _level) {
  const normalizedPath = path.normalize(parsedUrl.path);
  console.log(`[fileHandler] Accessing: "${normalizedPath}"`);

  let stats;
  try {
    stats = await fs.stat(normalizedPath);
  } catch (err) {
    throw new Error(`Cannot access "${normalizedPath}": ${err.message}`);
  }

  if (stats.isDirectory()) {
    return await fs.readdir(normalizedPath);
  }

  if (stats.isFile()) {
    if (!fileWhitelist.includes(normalizedPath)) {
      throw new BlockedError(`File "${normalizedPath}" is not in the whitelist`);
    }
    return fs.readFile(normalizedPath, 'utf8');
  }

  throw new Error(`"${normalizedPath}" is not a regular file or directory`);
}

module.exports = fileHandler;