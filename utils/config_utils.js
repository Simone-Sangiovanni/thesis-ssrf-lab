const path = require('path');
const fs = require('fs');

// Default configuration structure for a level
const DEFAULT_CONFIG = {
    protocol: [],
    hostWhitelist: [],
    hostBlacklist: [],
    portWhitelist: [],
    portBlacklist: [],
    fileWhitelist: [],
    fileBlacklist: [],
    doubleEncoding: false
};

/**
 * Reads and parses the configuration file for a given level.
 * The config file is expected to be located at:
 *   <project_root>/levels/config/<level>.json
 *
 * @param {string} level - Level identifier (e.g., "level_1", "level_2")
 * @returns {Object} Configuration object for the level (merged with defaults)
 * @throws {Error} If the config file cannot be read or parsed
 */
function parseConfig(level) {
    const configFileName = `${level}.json`;
    // __dirname is /app/levels inside the container (or local equivalent)
    const configPath = path.join(__dirname, '..', 'levels', 'config', configFileName);
    let config = { ...DEFAULT_CONFIG };

    try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        const parsedConfig = JSON.parse(fileContent);
        // Merge the parsed config over the defaults
        config = { ...config, ...parsedConfig };
    } catch (err) {
        console.error(`[parseConfig] Failed to load config for level "${level}" from ${configPath}: ${err.message}`);
        throw new Error(`Error while parsing config file for level "${level}"`);
    }

    return config;
}

module.exports = { parseConfig };