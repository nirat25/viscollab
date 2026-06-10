// test.js
const fs = require('fs');
const { JSDOM } = require('jsdom');

console.log("Loading HTML...");
const html = fs.readFileSync('c:/Users/nirat/OneDrive/Continuing_Education/Portfolio/Viscollab/spike-collab/index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost" });
const window = dom.window;
const document = window.document;

setTimeout(() => {
    try {
        console.log("Running tests...");
        const spike = window.__spike;
        if (!spike) {
            console.error("Spike API not found!");
            process.exit(1);
        }

        let passed = 0;
        let failed = 0;

        function assert(condition, message) {
            if (condition) {
                console.log("✅ PASS: " + message);
                passed++;
            } else {
                console.error("❌ FAIL: " + message);
                failed++;
            }
        }

        // Test 1: Fuzzy Match Truncation
        // Create a comment on a long piece of text (>32 chars)
        const longQuote = "Recommendation: consolidate the three analytics vendors onto Vendor A this quarter — it cuts cost ~46% with the lowest migration effort and covers every current use case.";
        const c1Id = spike.addText(longQuote, "This is a long quote.");
        
        // Modify the beginning of the text
        const art = document.getElementById('artifact');
        const lead = document.getElementById('lead');
        lead.innerHTML = "Suggestion: consolidate the three analytics vendors onto <b>Vendor A</b> this quarter — it cuts cost ~46% with the lowest migration effort and covers every current use case.";
        
        spike.render();
        const c1 = spike.comments.find(c => c.id === c1Id);
        assert(c1.anchorStatus === 'stale', "Fuzzy match truncation: Should be stale, but is " + c1.anchorStatus);

        // Test 2: Disambiguation
        // Duplicate a paragraph
        const p1 = document.createElement('p');
        p1.textContent = "This is an identical paragraph.";
        const p2 = document.createElement('p');
        p2.textContent = "This is an identical paragraph.";
        art.appendChild(p1);
        art.appendChild(p2);
        
        const identicalQuote = "This is an identical paragraph.";
        const c2Id = spike.addText(identicalQuote, "A comment on identical paragraph.");
        
        // At this point, the text is duplicate. Now change the text of BOTH paragraphs slightly.
        p1.textContent = "This is an identical paragraph. Changed 1.";
        p2.textContent = "This is an identical paragraph. Changed 2.";
        
        spike.render();
        const c2 = spike.comments.find(c => c.id === c2Id);
        assert(c2.anchorStatus === 'orphaned', "Disambiguation: Should be orphaned, but is " + c2.anchorStatus);

        // Test 3: Race Condition in startReattach
        // Start reattach on c1
        window.startReattach(c1);
        const reattach1Id = window.reattachId;
        // Then start reattach on c2 without closing modal
        window.startReattach(c2);
        
        // Check if modal closes and reattachId is c2
        assert(window.reattachId === c2Id, "Race condition: reattachId should be c2Id");
        assert(document.getElementById('mergepop').style.display === 'none', "Race condition: mergepop should be closed");

        // Simulate cancel of old modal callback
        document.getElementById('mergeCancel').onclick();
        assert(window.reattachId === c2Id, "Race condition: old modal cancel shouldn't clear new reattachId");

        // Test 4: Persistence Limitation
        window.toggleEdit(true);
        lead.innerHTML = "Edited while in edit mode.";
        window.toggleEdit(false);
        const savedHtml = window.localStorage.getItem('collab-spike-v4-artifact');
        assert(savedHtml.includes('Edited while in edit mode.'), "Persistence: LocalStorage should have saved the edit.");

        console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
    } catch (e) {
        console.error("Test execution failed:", e);
    }
}, 1000);
