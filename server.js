const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const levelHandler = require('./handler');
const misc = require('./utils/miscellaneous');
const { loadConfig } = require('./utils/config_utils');
const InternalServer = require('./internal-server-manager');

// ------------------- Configuration -------------------
const PORT = process.env.PORT || 3000;
const VIEWS_DIR = path.join(__dirname, 'view');
const INTERNAL_SERVER_SCRIPT = path.join(__dirname, 'internal-server.js');
const HINTS_FOLDER = path.join(__dirname, 'hints');
// Registry of running internal server (port -> InternalServer instance)
let internalServer = new InternalServer();

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

    // check if the level id is valid
    if (!misc.isValidLevel(levelId)) {
        return res.status(404).json({ error: 'Level not found', isValid: false });
    }

    // get the data necessary to build the level page
    try {
        const levelName = misc.formatLevelName(levelId);
        const hintPath = path.join(HINTS_FOLDER, levelId);
        const hint = await fs.readFile(hintPath, 'utf8');
        // render the level html page
        res.render('level', { level: levelId, levelName: levelName, hint: hint });
    } catch (error) {
        return res.status(404).send({ error: 'Hint file not found', isValid: false });
    }
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
        
        if (internalServer.port != config.internalPort) {
            await internalServer.stopServer();
            internalServer.cleanupServer();
            internalServer = new InternalServer(config.internalPort);
            await internalServer.startServer();
        }

        const content = await levelHandler.handleURL(fileUrl, levelId, config);
        res.json({ content, isValid: true });
    } catch (err) {
        res.status(400).json({ content: err.message, isValid: false });
    }
});



// ------------------- Start Server -------------------
app.listen(PORT, () => {
    console.log(`SSRF Lab started on http://localhost:${PORT}`);
});