const express = require('express');
const path = require('path');
const { fork } = require('child_process');
const app = express();
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

// Load level modules (each exports handleURL)
const levelHandlers = {
    level_1: require('./levels/level_1'),
    level_2: require('./levels/level_2'),
    level_3: require('./levels/level_3'),
    level_4: require('./levels/level_4'),
    level_5: require('./levels/level_5'),
    level_6: require('./levels/level_6'),
    level_7: require('./levels/level_7'),
};

// ------------------- ROUTES -------------------

// Home page
app.get('/ssrf', async (req, res) => {
    res.sendFile(path.join(__dirname, 'view', 'home.html'));
});
app.get('/', (req, res) => res.redirect('/ssrf'));

// Displays the level page (HTML with JS that will perform the fetch)
app.get('/ssrf/:level', async (req, res) => {
    const level = req.params.level;
    if (!levelHandlers[level]) {
        return res.status(404).send('<h1>404 - Level not found</h1>');
    }
    const levelName = level.replace('_', ' ').replace(/level (\d)/i, 'Level $1');
    // use a template server side (in our case Handlebars) to generate and send an html page
    res.render('level', { level, levelName });
});

// API endpoint that executes the SSRF (called via AJAX from the browser)
app.get('/ssrf/:level/fetch', async (req, res) => {
    const level = req.params.level;
    const handler = levelHandlers[level];
    
    // If the handler for the specific level is not found
    if (!handler) {
        return res.status(404).json({ error: 'Level not found', isValid: false });
    }
    
    // If the fileurl parameter is missing from the query string
    let fileurl = req.query.fileurl;
    if (!fileurl) {
        return res.status(400).json({ error: 'Missing ?fileurl parameter', isValid: false });
    }
    
    // Executes the level handler
    try {
        const output = await handler.handleURL(fileurl, level);
        res.json({ content: output, isValid: true });
    } catch (err) {
        res.json({ content: err.message, isValid: false });
    }
});

app.listen(PORT, () => {
    console.log(`SSRF Lab started on http://localhost:${PORT}`);
});