const path = require('path');
const fs = require('fs');

/**
 * Read the configuration file of the level and return an object.
 * @param {string} level: level name. Example: level_1, level_2, level_3 ... 
 * @returns {Object}: object containing the congiguration read from the level config file
 */
function parseConfig(level) {
    const configFile = level + ".json";
    // __dirname is /app/levels inside the container
    const configPath = path.join(__dirname, '..', 'levels', 'config', configFile);
    // default config object
    let config = {
        protocol: [],
        host: [],
        port: [],
        whitelist: [],
        blacklist: [],
        doubleEncoding: false
    };

    try {
        const data = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(data);
    } catch (err) {
        console.log('Error while parsing the config file');
        throw new Error("Error while parsing the config file");
    }

    return config;
}

module.exports = { parseConfig };