const express = require('express');
const path = require('path');
const app = express();
const fs = require('fs').promises;
const misc = require('./utils/miscellaneous');
const PORT = 80;

// list of the valid levels: ["level_1", "level_2", ...]
const VALID_LEVELS = misc.getValidLevels();
 
// Accept only local requests
app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;   // Get client IP from the raw socket
    const isLocal = ['127.0.0.1', '::1'].includes(ip); // Check if IP is exactly 127.0.0.1
    if (!isLocal) {
        return res.status(403).send({ error: 'IP blocked' }); // Reject non-local
    }
    next(); // Allow localhost requests to proceed
});

// internal API gateway
app.get('/', async (req, res) => {
    const entries = await fs.readdir('/');
    res.send({
        endpoints: entries,
    });
});

// handle the internal http requests, provide directory contents or the content of the level's flag.
// do not allow reading other files 
app.use(async (req, res) => {
    const level = req.headers['x-current-level'];
    console.log("\n level: " + level);    
    console.log("\n path " + req.path);
    const requested = req.path.substring(1);
    console.log("\n requested: " + requested);
    const fullPath = path.resolve('/', requested);
    console.log("\n fullPath: " + fullPath);
    
    // Reject if header is missing or invalid
    if (!level || !VALID_LEVELS.includes(level)) {
        return res.status(403).send({ error: 'Missing or invalid X-Current-Level header' });
    }
    
    const stat = await fs.stat(fullPath); // get info about the path: directory or file
    if (stat.isDirectory()) {
        // Directory request → return contents as text
        const entries = await fs.readdir(fullPath);
        return res.send({
            directory: fullPath,
            contents: entries
        });
    } else {
        if (fullPath.includes(level)) {
            const content = await fs.readFile(fullPath, 'utf8');
            return res.send(content);
        } else {
            return res.status(403).send({error: `You cannot read this flag: "${fullPath}".`});
        }
    }
});


app.listen(PORT, '127.0.0.1', () => {
    console.log(`Internal Service started`);
});
