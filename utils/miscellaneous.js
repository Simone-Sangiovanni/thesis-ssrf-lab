const path = require('path');
const fs = require('fs');



/**
 * Returns a list of all valid level identifiers by scanning the `levels/config` directory.
 * A valid level is any `.json` file in that directory (the filename without extension is used as the level ID).
 *
 * @returns {string[]} Array of level identifiers (e.g., ["level_1", "level_2"]). Returns an empty array on error.
 */
function getValidLevels() {
    const configDir = path.join(__dirname, '..', 'config');

    try {
        const files = fs.readdirSync(configDir);
        // Assumes every file is a .json config. If not, the caller may filter further.
        return files.map(file => path.basename(file, '.json'));
    } catch (err) {
        console.error(`[getValidLevels] Could not read config directory "${configDir}": ${err.message}`);
        return [];
    }
}


/**
 * Returns a formatted level name for display purposes.
 * @param {string} levelId - e.g. "level_1" or "level_2"
 * @returns {string} Human readable level name
 */
const formatLevelName = (levelId) => {
    return levelId
        .replace(/_/g, ' ')
        .replace(/level (\d)/i, 'Level $1');
};


/**
 * Validates that the requested level exists.
 * @param {string} levelId
 * @returns {boolean}
 */
const isValidLevel = (levelId) => {
    const validLevels = getValidLevels();
    return validLevels.includes(levelId);
};



module.exports = { getValidLevels, formatLevelName, isValidLevel };