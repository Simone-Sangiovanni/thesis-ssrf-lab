const path = require('path');
const fs = require('fs');

/**
 * Read the ./levels/config directory to know what the valid levels
 * @returns {list}: list of the levels config file
 */
function getValidLevels() {
    const configDir = path.join(__dirname, '..', 'levels', 'config');
    try {
        const files = fs.readdirSync(configDir);
        return files.map(file => path.basename(file, '.json'));
    } catch (err) {
        console.error('Could not read config directory:', err.message);
        return [];
    }
}

module.exports = { getValidLevels };