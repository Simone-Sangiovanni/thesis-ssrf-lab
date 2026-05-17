const express = require('express');
const path = require('path');
const app = express();
const fs = require('fs').promises;
const misc = require('./utils/miscellaneous');
const PORT = 80;

// list of the valid levels: ["level_1", "level_2", ...]
const VALID_LEVELS = misc.getValidLevels();
 
// Accetta solo connessioni da in cui l'host è 127.0.0.1
app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;
    const isLocal = ['127.0.0.1'].includes(ip);
    if (!isLocal) {
        return res.status(403).json({ error: 'Forbidden: internal service only' });
    }
    next();
});

// internal API gateway
app.get('/', async (req, res) => {
    const entries = await fs.readdir('/');
    res.json({
        endpoints: entries,
    });
});


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
        return res.status(403).json({ error: 'Missing or invalid X-Current-Level header' });
    }
    
    // Construct the flag file path (adjust if your flags are named differently)
    const flagPath = `/flags/${level}`;   // e.g., /flags/level_1
    
    try {
        const content = await fs.readFile(flagPath, 'utf8');
        res.send(content);
    } catch (err) {
        res.status(404).json({ error: `Flag for ${level} not found` });
    }
});


app.listen(PORT, '127.0.0.1', () => {
    console.log(`Internal Service started`);
});
