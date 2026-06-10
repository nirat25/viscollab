const fs = require('fs');

const html = fs.readFileSync('spike-collab/index.html', 'utf8');
const scriptMatch = html.match(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/diff_match_patch\/20121119\/diff_match_patch\.js"><\/script>\s*<script>([\s\S]*?)<\/script>/);

let jsCode = scriptMatch[1];
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
function testTeleportation() {
  const art = document.getElementById('artifact');
  
  // Set up document with a quote that appears twice in different contexts
  art.innerHTML = "Context A prefix. The exact same quote. Context A suffix. \\n\\n Context B prefix. The exact same quote. Context B suffix.";
  
  // Create comment on first occurrence
  const t = fullText(art);
  const q = "The exact same quote.";
  const i = t.indexOf(q); // Finds first occurrence
  const pre = t.slice(Math.max(0, i - 32), i);
  const suf = t.slice(i + q.length, i + q.length + 32);
  
  const c = {
    target: {
      type: 'text',
      quote: q,
      prefix: pre,
      suffix: suf
    }
  };
  
  // Now, user DELETES the first occurrence AND its context completely.
  art.innerHTML = "Context B prefix. The exact same quote. Context B suffix.";
  
  const loc = locate(art, c);
  
  console.log(JSON.stringify(loc, null, 2));
}

testTeleportation();
`;

fs.writeFileSync('spike-collab/challenge_teleportation.js', harness);
