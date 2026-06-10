const fs = require('fs');

function runTest() {
    console.log("--- Test 4: Disambiguation Context Sensitivity ---");
    const quote = "Vendor A";
    const originalText = "Option 1: choose Vendor A. Option 2: choose Vendor A today.";
    // Comment attached to the SECOND "Vendor A".
    // Prefix: "Option 2: choose "
    // Suffix: " today."
    
    const pre = "Option 2: choose ";
    const suf = " today.";
    
    // Now the author slightly edits the context of the SECOND Vendor A
    const editedText = "Option 1: choose Vendor A. Option 2: please choose Vendor A right today.";
    
    // Let's trace the logic:
    const text = editedText;
    const q = quote;
    const hits = [];
    let i = text.indexOf(q); 
    while(i !== -1) { hits.push(i); i = text.indexOf(q, i + 1); }
    
    let best = hits[0], bs = -1;
    for(const h of hits) {
        const p = text.slice(Math.max(0, h - pre.length), h);
        const s = text.slice(h + q.length, h + q.length + suf.length);
        const sc = (p.endsWith(pre) ? pre.length : 0) + (s.startsWith(suf) ? suf.length : 0);
        if (sc > bs) { bs = sc; best = h; }
    }
    
    console.log(`Original attachment was on second occurrence.`)
    console.log(`After slight context edit, attached to index: ${best}`);
    if (best === hits[0]) {
        console.log("BUG: Comment silently jumped to the FIRST occurrence because strict context matching failed!");
    }
}

runTest();
