// internal_server.js
const express = require('express');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const misc = require('./utils/miscellaneous');


// ---------- Configuration ----------
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 4000;
// list of the valid levels: ["level_1", "level_2", ...]
const VALID_LEVELS = misc.getValidLevels();

// ---------- Create Express App ----------
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Accept only local requests
app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;   // Get client IP from the raw socket
    console.log("\nip: " + ip);
    const isLocal = ['127.0.0.1', '::1'].includes(ip); // Check if IP is exactly 127.0.0.1
    if (!isLocal) {
        return res.status(403).send({ error: 'IP blocked' }); // Reject non-local
    }
    next(); // Allow localhost requests to proceed
});

// ---------- Routes ----------

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
    const requested = req.path.substring(1);
    const fullPath = path.resolve('/', requested);
    
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


// create 2 servers that shares the same backend. One that listen to the ipv4 interface and the other to the ipv6 interface
const server4 = app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Server IPv4 in ascolto su http://127.0.0.1:${PORT}`);
    if (process.send) process.send('ready');
});

const server6 = app.listen(PORT, '::1', () => {
    console.log(`✅ Server IPv6 in ascolto su http://[::1]:${PORT}`);
    if (process.send) process.send('ready');
});


// ---------- Graceful Shutdown ----------
const shutdown = () => {
    console.log('[Internal Server] Shutting down...');
    server4.close(() => process.exit(0));
    server6.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);