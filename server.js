const express = require('express');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const app = express();
const levelHandler = require('./levels/handler');
const misc = require('./utils/miscellaneous');
const PORT = 3000;

// Simulates a private backend reachable only via localhost
const internalProc = fork(path.join(__dirname, 'internal-server.js'), [], {
    silent: false,
    detached: false,
});
internalProc.on('error', err => console.error('[Internal] Startup error:', err.message));
process.on('exit', () => internalProc.kill());

// Handlebars: templates are located in the "view" folder
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'view'));

// Static files (home.html, style.css) from the "view" folder
app.use(express.static(path.join(__dirname, 'view')));

// ------------------- ROUTES -------------------

// Home page
app.get('/ssrf', async (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'home.html'));
});
app.get('/', (req, res) => res.redirect('/ssrf'));

// Displays the level page (HTML with JS that will perform the fetch)
app.get('/ssrf/:level', async (req, res) => {
    const level = req.params.level;
    const validLevels = misc.getValidLevels();
    // check if the level is valid
    if (!validLevels.includes(level)) {
        return res.status(404).send('<h1>404 - Level not found</h1>');
    }
    const levelName = level.replace('_', ' ').replace(/level (\d)/i, 'Level $1');
    // TODO: the return page must include the right hint for the level
    res.render('level', { level, levelName });
});

// API endpoint that executes the SSRF (called via AJAX from the browser)
app.get('/ssrf/:level/fetch', async (req, res) => {
    const level = req.params.level;
    
    // if the handler is not loaded correctly
    if (!levelHandler) {
        return res.status(404).json({ error: 'Error while loading the handler', isValid: false });
    }
    
    let fileurl = req.query.fileurl;
    // if the fileurl parameter is missing
    if (!fileurl) {
        return res.status(400).json({ error: 'Missing ?fileurl parameter', isValid: false });
    }
    
    try {
        const output = await levelHandler.handleURL(fileurl, level);
        res.json({ content: output, isValid: true });
    } catch (err) {
        res.json({ content: err.message, isValid: false });
    }
});

app.listen(PORT, () => {
    console.log(`SSRF Lab started on http://localhost:${PORT}`);
});