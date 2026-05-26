const express = require('express');
const path = require('path');
const fs = require('fs');

const levelHandler = require('./new_structure/handler');
const misc = require('./utils/miscellaneous');
const { loadConfig } = require('./new_structure/utils/config_utils');
const InternalServer = require('./internal-server-manager');


// ------------------- Configuration -------------------
const PORT = process.env.PORT || 3000;
const VIEWS_DIR = path.join(__dirname, 'view');
const INTERNAL_SERVER_SCRIPT = path.join(__dirname, 'internal-server.js');
// Registry of running internal servers (port -> InternalServer instance)
const runningInternalServers = new Map();


// ------------------- Helper Functions -------------------
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
    const validLevels = misc.getValidLevels();
    return validLevels.includes(levelId);
};


// ------------------- Express App Setup -------------------
const app = express();

// Handlebars view engine setup
app.set('view engine', 'hbs');
app.set('views', VIEWS_DIR);
// Serve static files (home.html, style.css, etc.) from the view folder
app.use(express.static(VIEWS_DIR));


// ------------------- Routes -------------------
// Home page redirect
app.get('/', (req, res) => res.redirect('/ssrf'));

// Main SSRF entry page
app.get('/ssrf', async (req, res) => {
    res.sendFile(path.join(VIEWS_DIR, 'home.html'));
});

// Level page (renders the Handlebars template with the level hint)
app.get('/ssrf/:level', async (req, res) => {
    const levelId = req.params.level;

    if (!isValidLevel(levelId)) {
        return res.status(404).send('<h1>404 - Level not found</h1>');
    }

    const levelName = formatLevelName(levelId);
    // TODO: pass the appropriate hint for the level
    res.render('level', { level: levelId, levelName });
});

// API endpoint that performs the SSRF fetch (called via AJAX from the browser)
app.get('/ssrf/:level/fetch', async (req, res) => {
    const levelId = req.params.level;
    const fileUrl = req.query.fileurl;

    // Guard: missing required parameter
    if (!fileUrl) {
        return res.status(400).json({ error: 'Missing ?fileurl parameter', isValid: false });
    }

    // Guard: level handler not available
    if (!levelHandler) {
        return res.status(404).json({ error: 'Error while loading the handler', isValid: false });
    }

    try {
        const config = loadConfig(levelId);
        const internalPort = config.internalPort;
        console.log(`[server.js] config: ${JSON.stringify(config, null, 2)}`);
        
        let internalServer = runningInternalServers.get(internalPort);
        if(!internalServer) {
            const internalServer = new InternalServer(config.internalPort)
            await internalServer.startServer();
            runningInternalServers.set(internalPort, internalServer);

            // Clean up registry entry when the server stops/crashes
            const cleanup = internalServer.cleanupServer.bind(internalServer);
            internalServer.cleanupServer = () => {
                cleanup();
                if (runningInternalServers.get(internalPort) === internalServer) {
                    runningInternalServers.delete(internalPort);
                }
            };
        }

        
        
        const content = await levelHandler.handleURL(fileUrl, levelId);
        res.json({ content, isValid: true });
    } catch (err) {
        res.json({ content: err.message, isValid: false });
    }
});

// ------------------- Start Server -------------------
app.listen(PORT, () => {
    console.log(`SSRF Lab started on http://localhost:${PORT}`);
});