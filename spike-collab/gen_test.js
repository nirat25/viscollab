const fs = require('fs');

// Read the index.html and extract the script block
const html = fs.readFileSync('spike-collab/index.html', 'utf8');
const scriptMatch = html.match(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/diff_match_patch\/20121119\/diff_match_patch\.js"><\/script>\s*<script>([\s\S]*?)<\/script>/);

let jsCode = scriptMatch[1];
// Mock DOM and required APIs
const mockDOM = `
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="artifact"></div></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.NodeFilter = dom.window.NodeFilter;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.CSS = { highlights: { set: () => {} } };
global.Highlight = class {};
global.scrollX = 0;
global.scrollY = 0;
global.innerWidth = 1024;
global.performance = { now: () => 0 };

const diff_match_patch = require('diff-match-patch');
global.diff_match_patch = diff_match_patch;
`;

const harness = mockDOM + jsCode + `
// --- Test ---
function testTeleportation() {
  const art = document.getElementById('artifact');
  art.innerHTML = "Prefix here. Target Quote. Suffix here. \\n\\n Other text... \\n\\n Other Prefix. Target Quote. Other Suffix.";
  
  // Create comment on first occurrence
  const t = fullText(art);
  const q = "Target Quote.";
  const i = t.indexOf(q);
  const c = {
    target: {
      type: 'text',
      quote: q,
      prefix: t.slice(Math.max(0, i - 32), i),
      suffix: t.slice(i + q.length, i + q.length + 32)
    }
  };
  
  // Edit the first occurrence and its context completely so that neither pre nor suf exist,
  // and fuzzy match won't match the new context.
  art.innerHTML = "COMPLETELY DIFFERENT TEXT. NO PREFIX. NO SUFFIX. \\n\\n Other text... \\n\\n Other Prefix. Target Quote. Other Suffix.";
  
  const loc = locate(art, c);
  console.log('Location status:', loc.status);
  if (loc.status !== 'orphaned') {
      console.log('Teleported!', loc);
  } else {
      console.log('Properly orphaned!');
  }
}

testTeleportation();
`;

fs.writeFileSync('spike-collab/challenge_teleport.js', harness);
