const fs = require('fs').promises;
const path = require('path');

// Whitelisted directories (access allowed to all their contents)
const WHITELIST = [
    '/flags/level_1'
];

async function handleURL(url) {
    const urlObj = new URL(url);  // create a url object
    const protocol = urlObj.protocol; // extract the protocolo from the url
    
    if (protocol === 'file:') {
        let filePath = urlObj.pathname;
        const normalized = path.normalize(filePath); // resolve the path expanding . and ..

        const stat = await fs.stat(normalized);
        if (stat.isDirectory()) {
            // Directory request → return contents as JSON
            const entries = await fs.readdir(normalized);
            return JSON.stringify({
                directory: normalized,
                contents: entries
            }, null, 2);
        } else { // if the url point to a file
            // Check if the normalized path is within a whitelisted directory
            const isAllowed = WHITELIST.some(file => {
                return normalized === file;
            });
            // if the path is not allowed throw an error
            if (!isAllowed) {
                throw new Error(`Access denied. Path "${normalized}" is not allowed.`);
            }
        }
        
        // Regular file → read and return content
        return await fs.readFile(normalized, 'utf8');
    }
    
    // if the protocols are http or https fetch the url and return it
    if (protocol === 'http:' || protocol === 'https:') {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return await response.text();
    }
    
    // allowed protocols are file, http and https
    throw new Error(`Protocol ${protocol} not supported. Use file://, http:// or https://`);
}

// exports the handleURL function so it can be used by other modules
module.exports = { handleURL };