const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// We wait for scripts to parse
setTimeout(() => {
    console.log("=== EMPIRICAL VERIFICATION REPORT ===");
    const spike = window.__spike;
    if (!spike) {
        console.error("Spike API not found!");
        return;
    }

    let passCount = 0;
    let failCount = 0;

    function assert(name, condition, errorMsg) {
        if (condition) {
            console.log(`[PASS] ${name}`);
            passCount++;
        } else {
            console.error(`[FAIL] ${name} -> ${errorMsg}`);
            failCount++;
        }
    }

    // TEST 1: Diff-Match-Patch Search Horizon Bug
    console.log("\n--- Test 1: DMP Horizon limit on prefix edit ---");
    // Create a long document
    let padding = "A ".repeat(1000); // 2000 chars
    let quote = "This is a very specific target string that we want to find.";
    let originalText = padding + "Some prefix here. " + quote + " Some suffix.";
    
    // Simulate what locate() receives
    let comment = {
        target: {
            type: 'text',
            quote: quote,
            prefix: "Some prefix here. ",
            suffix: " Some suffix."
        }
    };
    
    // Mutate the document: Edit the prefix so exact match fails, but quote remains intact
    let newText = padding + "Some CHANGED prefix here. " + quote + " Some suffix.";
    
    // Expose locating function
    // We can directly call fuzzyFind by evaluating in the page context
    let script = document.createElement('script');
    script.textContent = `
        window.testDMP = function(text, q, pre) {
            const hint = pre ? text.indexOf(pre) : -1;
            return fuzzyFind(text, q, hint >= 0 ? hint + pre.length : -1);
        };
    `;
    document.body.appendChild(script);

    let result = window.testDMP(newText, quote, comment.target.prefix);
    assert("DMP finds quote beyond distance limit", result.index !== -1, "fuzzyFind returned index -1 because text.indexOf(pre) failed, fallback loc=0, and distance > Match_Distance*Threshold.");

    // TEST 2: Re-attach UX state leakage
    console.log("\n--- Test 2: Re-attach UX State Leakage ---");
    // Simulate startReattach toggling
    window.eval(`
        let dummyEl = document.createElement('div');
        dummyEl.id = 'dummy';
        document.body.appendChild(dummyEl);
        let cId = window.__spike.addEl('#dummy', 'flag', 'test');
        let c = window.__spike.comments.find(x => x.id === cId);
        
        // 1. Enter reattach mode
        startReattach(c);
        window.testPickingState1 = picking; // should be true
        
        // 2. Cancel reattach mode by clicking again
        startReattach(c);
        window.testPickingState2 = picking; // should be false but it leaks
    `);
    
    assert("Picking state cleared on re-attach cancel", window.testPickingState2 === false, "Cancel re-attach leaves picking=true, breaking text selection globally.");

    // TEST 3: DMP Truncation Bug
    console.log("\n--- Test 3: DMP Target Truncation ---");
    window.eval(`
        let quote = "This is the original text quote";
        let text = "This is the NEW AND EDITED text quote";
        let f = fuzzyFind(text, quote, -1);
        // Emulate locate() logic
        let end = Math.min(text.length, f.index + quote.length);
        window.testNewText = text.slice(f.index, end);
    `);
    assert("DMP captures full edited string", window.testNewText === "This is the NEW AND EDITED text quote", `Sliced based on original length, result: "${window.testNewText}"`);

    console.log(`\nResults: ${passCount} passed, ${failCount} failed.`);
}, 500);
