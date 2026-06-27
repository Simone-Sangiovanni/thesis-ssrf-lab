const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const misc = require('./utils/miscellaneous');


const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 4000;
const VALID_LEVELS = misc.getValidLevels();
const app = express();
// Simple in-memory cache to shield the disk from heavy fuzzer traffic
const statCache = new Map();
const CACHE_TTL = 5000; // Keep cache entries for 5 seconds

// credentials
const username = 'alfred';
const password = 'sCw2QA6H';


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// IP validation middleware
app.use((req, res, next) => {
    let ip = req.socket.remoteAddress;
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    if (!['127.0.0.1', '::1'].includes(ip)) {
        return res.status(403).send({ error: 'IP blocked' });
    }
    next();
});


app.get('/', async (req, res, next) => {
    console.log(`request: ${req.headers.authorization}`);
    try {
        const entries = await fs.readdir('/');
        res.send(entries);
    } catch (err) {
        next(err);
    }
});


app.get('/secretPath', async (req, res, next) => {
    const level = req.headers['x-current-level'];
    if (!level || !VALID_LEVELS.includes(level)) {
        return res.status(403).send({ error: 'Missing or invalid X-Current-Level header' });
    }
    try {
        if (level === "level_7") {
            return res.send({ flag_path: "/etc/hidden/flags/level_7" });
        } else if (level === "level_8") {
            return res.send({ env: process.env });
        }
    } catch (err) {
        next(err);
    }
});


// Main request handler
app.use(async (req, res, next) => {
    const level = req.headers['x-current-level'];
    const requested = req.path.substring(1);
    const fullPath = path.resolve('/', requested);
    
    if (!level || !VALID_LEVELS.includes(level)) {
        return res.status(403).send({ error: 'Missing or invalid X-Current-Level header' });
    }

    let stat;
    const now = Date.now();
    const cached = statCache.get(fullPath);

    // Serve stats from memory if available to optimize threadpool performance
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        stat = cached.stat;
    } else {
        try {
            stat = await fs.stat(fullPath);
            statCache.set(fullPath, { stat, timestamp: now });
        } catch (err) {
            return res.status(404).send({ error: 'Not found' });
        }
    }
    
    try {
        if (stat.isDirectory()) {
            const entries = await fs.readdir(fullPath, 'utf8');
            return res.send(entries);
        } else {
            if (level === 'level_1') {
                return res.status(403).send('Just in level 1 you cannot read the flag file using the http protocol.');
            }
            if (level === 'level_8' || fullPath.includes('level_8')) {
                let providedUsername = '';
                let providedPassword = '';

                if (req.headers.authorization && req.headers.authorization.startsWith('Basic ')) {
                    const token = req.headers.authorization.split(' ')[1];
                    const decoded = Buffer.from(token, 'base64').toString('ascii');
                    const [user, pass] = decoded.split(':');
                    providedUsername = user;
                    providedPassword = pass;
                }

                // Validate credentials
                if (providedUsername !== username || providedPassword !== password) {
                    return res.status(401).send('Unauthorized: Invalid credentials for level_8');
                }
            }
            if (fullPath.includes(level)) {
                const content = await fs.readFile(fullPath, 'utf8');
                return res.send(content);
            } else {
                return res.status(403).send(`You cannot read this flag: ${fullPath}.` );
            }
        }
    } catch (err) {
        next(err); 
    }
});


// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.message);
    if (!res.headersSent) {
        res.status(500).send({ error: 'Internal Server Error' });
    }
});



// Single dual-stack listener
const server = app.listen(PORT, '::', () => {
    console.log(`Server listening on port ${PORT} (IPv4/IPv6 Dual-Stack)`);
    if (process.send) process.send('ready');
});


const shutdown = () => {
    console.log('[Internal Server] Shutting down...');
    server.close(() => process.exit(0));
};


process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);