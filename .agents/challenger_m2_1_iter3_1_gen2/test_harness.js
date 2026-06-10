const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('c:/Users/nirat/OneDrive/Continuing_Education/Portfolio/Viscollab/spike-collab/index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });

// Wait for scripts to load if necessary, but diff_match_patch is a sync script from CDN.
// Since we are offline, the CDN script won't load.
// We must inject diff_match_patch locally!
