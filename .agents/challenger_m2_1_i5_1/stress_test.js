const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const path = require('path');
const diff_match_patch = require(path.resolve(__dirname, '../../spike-collab/node_modules/diff-match-patch/index.js'));

const targetPath = path.resolve(__dirname, '../../spike-collab/index.html');
let html = fs.readFileSync(targetPath, 'utf8');

// Remove the external CDN script tag so it doesn't hang or fail.
html = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/diff_match_patch/20121119/diff_match_patch.js"></script>', '');

const dom = new JSDOM(html, { 
    runScripts: "dangerously" 
});

// Inject diff_match_patch directly into the window before the spike scripts execute
dom.window.diff_match_patch = diff_match_patch;

setTimeout(() => {
    try {
        const window = dom.window;
        const document = window.document;
        const __spike = window.__spike;

        if (!__spike) {
            console.error("Spike logic not loaded.");
            process.exit(1);
        }

        console.log("=== Running Disambiguation Teleportation Stress Test ===");
        
        const art = document.getElementById('artifact');
        
        // Scenario: A phrase exists exactly once.
        const originalText = "Status quo (keep all three)";
        const commentId = __spike.addText(originalText, "Initial comment");
        const comment = __spike.comments[0];
        
        console.log("1. Created comment on target:", comment.target.quote);
        console.log("   Context prefix:", comment.target.prefix);
        console.log("   Context suffix:", comment.target.suffix);
        
        // Let's modify the DOM.
        // We change the original instance so it's no longer an exact match, but close (edit in place).
        const oldHtml = art.innerHTML;
        art.innerHTML = oldHtml.replace("Status quo (keep all three)", "Status quo (keep only two)");
        
        // And we ADD an exact match of the ORIGINAL quote somewhere entirely different (e.g., at the end of the document).
        art.innerHTML += `<p>By the way, we should remember the old Status quo (keep all three) plan.</p>`;
        
        // Now let's run locate.
        const loc = __spike.locate(comment);
        
        console.log("\n2. Ran locate() on modified document.");
        console.log("   Status:", loc.status);
        console.log("   Matched string:", loc.newText || comment.target.quote);
        console.log("   Matched start:", loc.start);
        
        // Verdict
        if (loc.status === 'anchored' && loc.start !== undefined) {
            // It might have anchored to the exact match. Let's check the context or just the string.
            const matchedString = window.__spike.fullText().slice(loc.start, loc.end);
            console.error("FAIL: Bug is present! It teleported to the exact match without context.");
            console.error("Matched:", matchedString);
            process.exit(1);
        } else if (loc.status === 'stale') {
            console.log("PASS: Bug is fixed! It fell back to fuzzy and marked it stale.");
            if (loc.newText === "Status quo (keep only two)") {
                console.log("   Found the correctly edited text at the original location.");
                process.exit(0);
            } else {
                console.error("   But it found something unexpected:", loc.newText);
                process.exit(1);
            }
        } else {
            console.error("FAIL: Unexpected status:", loc.status);
            process.exit(1);
        }
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}, 500);
