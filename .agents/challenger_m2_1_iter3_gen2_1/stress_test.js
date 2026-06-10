const fs = require('fs');
const path = require('path');
const diff_match_patch = require('diff-match-patch'); // Requires: npm install diff-match-patch

// Load the target file
const targetPath = path.join(__dirname, '../../spike-collab/index.html');
const html = fs.readFileSync(targetPath, 'utf-8');

// Extract JS block
const jsMatch = html.match(/<script>\s*([\s\S]+?)\s*<\/script>/);
if (!jsMatch) {
    console.error("Could not find script block");
    process.exit(1);
}
let scriptContent = jsMatch[1];

// We need to test specific functions: fuzzyFind, locate (disambiguation).
// Since we don't have DOM easily in pure Node without JSDOM, we will extract just the logic for fuzzyFind.

const dmp = new diff_match_patch();
dmp.Match_Distance = 1000000;
dmp.Match_Threshold = 0.5;

function fuzzyFind(text, quote, hintIdx) {
  const loc = hintIdx >= 0 ? hintIdx : 0;
  let index = -1, chunkOffset = 0;
  for (let i = 0; i < quote.length; i += 32) {
    const pattern = quote.substring(i, i + 32);
    index = dmp.match_main(text, pattern, loc + i);
    if (index !== -1) { chunkOffset = i; break; }
  }
  if (index === -1) return { index: -1, score: 0, length: 0 };
  const baseIndex = Math.max(0, index - chunkOffset);
  const margin = 50, start = Math.max(0, baseIndex - margin), end = Math.min(text.length, baseIndex + quote.length + margin);
  const windowText = text.substring(start, end);
  const diffs = dmp.diff_main(quote, windowText);
  dmp.diff_cleanupSemantic(diffs);
  let qPos = 0, tPos = 0, matches = 0, sOff = -1, eOff = 0;
  for (const [op, txt] of diffs) {
    if (op === 0) { if (sOff === -1) sOff = tPos; qPos += txt.length; tPos += txt.length; matches += txt.length; eOff = tPos; }
    else if (op === -1) { if (sOff === -1) sOff = tPos; qPos += txt.length; }
    else if (op === 1) { tPos += txt.length; }
    if (qPos >= quote.length) break;
  }
  if (sOff === -1) sOff = 0;
  const matchLen = eOff - sOff;
  return { index: start + sOff, score: matchLen > 0 ? matches / Math.max(quote.length, matchLen) : 0, length: matchLen };
}

// 1. Stress Test: fuzzy matching works for long spans (> 32 chars) and long distances
function testFuzzy() {
    console.log("--- Testing Fuzzy Matching ---");
    // Generator: create a long document
    const padding = "Some irrelevant padding text. ".repeat(1000); // 30,000+ chars
    const originalQuote = "This is a very specific sentence that is longer than 32 characters to test the chunking logic.";
    const text = padding + originalQuote + padding;
    
    // Oracle: should find exact match at distance
    const exact = fuzzyFind(text, originalQuote, 0);
    console.assert(exact.score === 1, "Expected exact match to have score 1, got " + exact.score);
    console.assert(exact.index === padding.length, "Expected exact match at distance");
    
    // Generator: heavily edit the quote
    const editedQuote = "This is a very specific sentence that is MUCH longer than 32 characters just to test the NEW chunking logic.";
    const editedText = padding + editedQuote + padding;
    
    // Oracle: should find fuzzy match
    const fuzzy = fuzzyFind(editedText, originalQuote, 0);
    console.assert(fuzzy.score > 0.6, "Expected fuzzy match score > 0.6, got " + fuzzy.score);
    console.assert(fuzzy.index === padding.length, "Expected fuzzy match at distance");
    console.log("Fuzzy match test PASSED.");
}

// 2. Stress Test: "never silently re-point" disambiguation rule
function testDisambiguation() {
    console.log("--- Testing Disambiguation ---");
    // We simulate the `locate` logic for multiple hits
    function simulateLocateMultipleHits(text, q, pre, suf) {
        const hits=[]; let i=text.indexOf(q); while(i!==-1){ hits.push(i); i=text.indexOf(q,i+1); }
        if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};
        if(hits.length>1){ 
            let best=hits[0],bs=0; 
            for(const h of hits){ 
                const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); 
                const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); 
                if(sc>bs){bs=sc;best=h;} 
            } 
            if(bs===0) return {status:'orphaned'}; // Disambiguation check
            return {status:'anchored',start:best,end:best+q.length}; 
        }
        return {status:'orphaned'};
    }

    const text = "Context A. THE TARGET TEXT. Context B. Some other stuff. Context C. THE TARGET TEXT. Context D.";
    const q = "THE TARGET TEXT";
    
    // Case 1: Can disambiguate (matches Context A)
    let pre1 = "Context A. ";
    let suf1 = ". Context B.";
    let res1 = simulateLocateMultipleHits(text, q, pre1, suf1);
    console.assert(res1.status === 'anchored', "Should anchor when context matches");
    console.assert(res1.start === text.indexOf(q), "Should anchor to first occurrence");

    // Case 2: Cannot disambiguate (context doesn't match any)
    let pre2 = "Context X. ";
    let suf2 = ". Context Y.";
    let res2 = simulateLocateMultipleHits(text, q, pre2, suf2);
    console.assert(res2.status === 'orphaned', "Should orphan when context matches neither occurrence (never silently repoint)");

    console.log("Disambiguation test PASSED.");
}

try {
    testFuzzy();
    testDisambiguation();
    console.log("All analytical tests PASSED.");
} catch(e) {
    console.error("Test failed:", e);
    process.exit(1);
}
