const fs = require('fs');
const { JSDOM } = require('jsdom');

function createDOM() {
    const html = fs.readFileSync('c:/Users/nirat/OneDrive/Continuing_Education/Portfolio/Viscollab/spike-collab/index.html', 'utf8');
    // Mock diff_match_patch
    const dmpScript = `
        window.diff_match_patch = class {
            constructor() {
                this.Match_Distance = 1000;
                this.Match_Threshold = 0.5;
            }
            match_main(text, pattern, loc) {
                // simulate the 32 char limit
                if (pattern.length > 32) return -1;
                // strict match simulation
                return text.indexOf(pattern, Math.max(0, loc - this.Match_Distance));
            }
            diff_main(text1, text2) {
                // simplified mock: just return a single equality or diff
                if (text1 === text2) return [[0, text1]];
                return [[-1, text1], [1, text2]];
            }
            diff_cleanupSemantic(diffs) {}
        };
    `;
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost" });
    // Inject mock dmp since we don't have network to load cdn script in JSDOM easily
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = dmpScript;
    dom.window.document.head.appendChild(scriptEl);
    
    return dom;
}

const dom = createDOM();
const window = dom.window;
const document = window.document;

setTimeout(() => {
    let passed = 0, failed = 0;
    function assert(cond, msg) { cond ? passed++ : failed++; console.log((cond ? "✅ " : "❌ ") + msg); }
    
    try {
        const spike = window.__spike;
        if (!spike) throw new Error("Spike not initialized");
        
        // 1. Fuzzy Match Chunking
        console.log("--- Fuzzy Match Truncation ---");
        const fuzzyFind = dom.window.fuzzyFind;
        // if text is huge and quote has been modified in first 32 chars
        const text = "A".repeat(100) + "modified_start_and_then_this_is_a_very_long_quote_that_exceeds_32_characters_by_a_lot" + "B".repeat(100);
        const quote = "original_start_and_then_this_is_a_very_long_quote_that_exceeds_32_characters_by_a_lot";
        
        // Since we mocked dmp to do exact substring match on 32 chars:
        // the first chunk "original_start_and_then_this_is_" won't match.
        // the second chunk "a_very_long_quote_that_exceeds_3" WILL match.
        const result = fuzzyFind(text, quote, 100);
        assert(result.index !== -1, "Should find the match even if first 32 chars are altered");

        // 2. Disambiguation
        console.log("--- Disambiguation ---");
        const locate = dom.window.locate; // We can call locate directly using spike.locate
        const duplicateQuote = "duplicate";
        const cDis = {
            target: {
                type: 'text',
                quote: duplicateQuote,
                prefix: "pre1",
                suffix: "suf1"
            }
        };
        // Provide text with multiple hits, but context doesn't match
        const dupText = "changed_pre_duplicate_changed_suf ... another_changed_pre_duplicate_changed_suf";
        // Mock fullText for the document
        dom.window.fullText = () => dupText;
        const root = document.createElement('div');
        root.textContent = dupText;
        
        const resDis = spike.locate(cDis);
        assert(resDis.status === 'orphaned', "Should orphan if contexts of all duplicates mismatch");
        
        // Match context
        cDis.target.prefix = "changed_pre_";
        const resDis2 = spike.locate(cDis);
        assert(resDis2.status === 'anchored', "Should anchor if context matches one of them");

        // 3. Merge UX Race Condition
        console.log("--- Race Condition ---");
        window.reattachId = 'comment1';
        window.modalCommentId = 'comment1';
        document.getElementById('mergepop').style.display = 'block';
        
        // User clicks reattach on comment2
        const c2 = {id: 'comment2', target: {type: 'text'}};
        window.startReattach(c2);
        
        assert(window.reattachId === 'comment2', "ReattachId should update to comment2");
        assert(document.getElementById('mergepop').style.display === 'none', "Modal should close");
        assert(window.mergeAction === null, "Merge action should be cleared");
        
        // Simulate clicking cancel on the OLD modal callback (if it was somehow still pending)
        document.getElementById('mergeCancel').onclick();
        assert(window.reattachId === 'comment2', "Old modal cancel should not affect new reattachId");
        
        // 4. Persistence Limitation
        console.log("--- Persistence Limitation ---");
        const art = document.getElementById('artifact');
        window.editing = true;
        art.innerHTML = "<p>New content</p>";
        window.toggleEdit(false);
        const saved = window.localStorage.getItem('collab-spike-v4-artifact');
        assert(saved === "<p>New content</p>", "Changes should be saved to localStorage upon exiting edit mode");
        
        console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    } catch (e) {
        console.error(e);
    }
}, 500);
