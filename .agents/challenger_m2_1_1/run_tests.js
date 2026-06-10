const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const path = require('path');

// Setup
const htmlPath = path.resolve(__dirname, '../../spike-collab/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

// We need to provide diff_match_patch as the global script expects it
const dmpScript = fs.readFileSync(path.resolve(__dirname, '../../node_modules/diff-match-patch/index.js'), 'utf-8').catch ? '' : ''; 
// We will mock diff_match_patch since we might not have it in node_modules,
// but let's see if we can just define a dummy or use a simple mock that replicates the 32-char logic.
const mockDmp = `
class diff_match_patch {
  constructor() { this.Match_Distance = 1000; this.Match_Threshold = 0.5; }
  match_main(text, pattern, loc) {
    // Simple mock: find exact index of pattern
    return text.indexOf(pattern);
  }
}
`;

const dom = new JSDOM(htmlContent, {
  runScripts: "outside-only",
  url: "http://localhost/"
});

const window = dom.window;
window.eval(mockDmp);
// Evaluate the spike script (the last script tag in the HTML)
const scriptContent = htmlContent.match(/<script>\s*\/\* ─+[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g, '');
window.eval(scriptContent);

const __spike = window.__spike;

console.log("=== EMPIRICAL CHALLENGER STRESS TEST ===");

// 1. diff-match-patch integration flaw: Truncation and Blind Slicing
console.log("\\n[Test 1] diff-match-patch blind slicing on fuzzy match");
let artText = __spike.fullText();
const quote = "Recommendation: consolidate the three analytics vendors onto Vendor A this quarter";
// The first 32 chars: "Recommendation: consolidate the "

const commentId = __spike.addText(quote, "Test comment");
let comment = __spike.comments.find(c => c.id === commentId);

console.log("Original text length:", artText.length);
console.log("Original quote length:", quote.length);

// Now mutate the DOM text heavily but keep the first 32 chars intact
window.document.getElementById('lead').innerHTML = "Recommendation: consolidate the vendors. " + "A".repeat(200);

let loc = __spike.locate(comment);
console.log("Locate status after mutation:", loc.status);
if (loc.status === 'stale') {
  console.log("New text captured by fuzzy match:");
  console.log("->", loc.newText);
  if (loc.newText.length === quote.length && loc.newText.includes('A'.repeat(20))) {
    console.log("FAIL: The fuzzy match blindly sliced `q.length` characters, swallowing unrelated text.");
  }
}

// 2. Re-attach UX Logic Race Condition
console.log("\\n[Test 2] Re-attach Logic: Dropped text selection");
__spike.comments[0].target.type = 'element'; // simulate element comment
window.reattachId = commentId; 
// Simulate a mouseup (text selection)
const range = window.document.createRange();
range.setStart(window.document.getElementById('why').firstChild, 0);
range.setEnd(window.document.getElementById('why').firstChild, 5);
const sel = window.getSelection();
sel.removeAllRanges();
sel.addRange(range);

const mouseupEvent = new window.Event('mouseup');
window.document.dispatchEvent(mouseupEvent);

if (window.reattachId === null && window.document.getElementById('mergepop').style.display !== 'block') {
  console.log("FAIL: Re-attach was silently aborted when text was selected for an element comment.");
} else {
  console.log("PASS: Handled correctly.");
}

// 3. Identity persistence & mentions
console.log("\\n[Test 3] Identity Persistence - Case sensitivity in mentions");
const replyBody = "@alex please review";
__spike.addReply(commentId, replyBody);
// Should notify Alex. The parseMentions logic uses toLowerCase, so it should match id 'alex'.
const notifs = __spike.notifications;
const alexNotifs = notifs.filter(n => n.to === 'alex');
if (alexNotifs.length > 0) {
  console.log("PASS: Mention notification generated for Alex.");
} else {
  console.log("FAIL: Mention notification not generated.");
}

console.log("\\nTests complete.");
