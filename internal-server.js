const express = require('express');
const path = require('path');
const app = express();
const fs = require('fs').promises;
const PORT = 80;
 
// Accetta solo connessioni da localhost
app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;
    const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
    if (!isLocal) {
        return res.status(403).json({ error: 'Forbidden: internal service only' });
    }
    next();
});


app.get('/', async (req, res) => {
    const entries = await fs.readdir('/');
    res.json({
        service: 'Internal API Gateway',
        version: '1.0.0',
        endpoints: entries,
    });
});


app.get('*', async (req, res) => {
    // req.path contiene l'intero percorso, es. '/flags/level_2'
    const requested = req.path.substring(1);  // rimuovi lo slash iniziale
    const fullPath = path.resolve('/', requested);
    
    console.log("full path: " + fullPath);

    // Basic path safety check
    if (!fullPath.startsWith('/')) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
            const entries = await fs.readdir(fullPath);
            return res.json({
                path: fullPath,
                type: 'directory',
                contents: entries
            });
        } else if (stats.isFile()) {
            let content = await fs.readFile(fullPath, "utf8")
            console.log("file: " + content)
            return res.send(content);
        } else {
            // Symlinks, devices, etc.
            return res.status(400).json({
                error: 'Path is not a regular directory or file',
                path: fullPath
            });
        }
    } catch (err) {
        // File not found, permission denied, etc.
        return res.status(404).json({
            error: 'Not found or cannot access',
            path: fullPath
        });
    }
});


app.listen(PORT, '127.0.0.1', () => {
    console.log(`Internal Service started`);
});
