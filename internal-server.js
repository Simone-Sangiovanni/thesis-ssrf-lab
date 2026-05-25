// internal_server.js
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

// ---------- Configuration ----------
const PORT = process.argv[2] ? parseInt(process.argv[2], 10) : 4000;

// ---------- Create Express App ----------
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS (only needed if called from browser; fine for internal use)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    next();
});

// ---------- Routes ----------

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: PORT });
});

// Fetch any URL – main endpoint for SSRF levels
app.get('/fetch', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing ?url parameter' });
    }

    try {
        const result = await fetchUrl(targetUrl);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Read a local file (restricted to a safe directory)
app.get('/read-file', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) {
        return res.status(400).json({ error: 'Missing ?path parameter' });
    }

    // Security: only allow files inside ./internal-files
    const safeBase = path.join(__dirname, 'internal-files');
    const absolutePath = path.resolve(safeBase, filePath);
    if (!absolutePath.startsWith(safeBase)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const content = await fs.readFile(absolutePath, 'utf8');
        res.send(content);
    } catch (err) {
        res.status(404).json({ error: 'File not found' });
    }
});

// Add more endpoints as needed for other levels (e.g., POST /proxy, /dns, etc.)

// ---------- Helper: Fetch any URL (HTTP/HTTPS) ----------
async function fetchUrl(targetUrl) {
    return new Promise((resolve, reject) => {
        const protocol = targetUrl.startsWith('https') ? https : http;
        const request = protocol.get(targetUrl, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        });
        request.on('error', reject);
        request.setTimeout(5000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// ---------- Start Server ----------
const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`[Internal Server] Listening on http://127.0.0.1:${PORT}`);
    // Notify parent process that we are ready
    if (process.send) process.send('ready');
});

// ---------- Graceful Shutdown ----------
const shutdown = () => {
    console.log('[Internal Server] Shutting down...');
    server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);