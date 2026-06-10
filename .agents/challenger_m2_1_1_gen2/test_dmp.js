const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');

// Simulate the test scenario
function runTests() {
  const html = fs.readFileSync(path.resolve(__dirname, '../../spike-collab/index.html'), 'utf-8');
  
  // Extract scripts to test dmp logic
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const window = dom.window;
  
  // Wait for scripts to execute (diff_match_patch is loaded from CDN in the actual file, 
  // but in JSDOM we might need to mock or load it directly. For this test, we demonstrate the logic flaws.)

  const testDmpLogic = () => {
    // Replicate the dmp matching logic from the file
    const dmp = require('diff-match-patch');
    const dmpObj = new dmp.diff_match_patch();
    dmpObj.Match_Distance = 1000;
    dmpObj.Match_Threshold = 0.5;

    function fuzzyFind(text, quote, hintIdx) {
      const pattern = quote.substring(0, 32);
      const loc = hintIdx >= 0 ? hintIdx : 0;
      const index = dmpObj.match_main(text, pattern, loc);
      if (index !== -1) {
        return { index: index, score: 0.8 }; 
      }
      return { index: -1, score: 0 }; 
    }

    const originalText = "The quick brown fox jumps over the lazy dog today.";
    // Assume user highlighted "brown fox jumps over the lazy dog" (33 chars)
    const quote = "brown fox jumps over the lazy dog";
    
    // Now the document changes to:
    const newText = "The quick brown red fox suddenly jumps over the very lazy dog today.";
    
    // hintIdx would be based on prefix. Let's say prefix was "quick "
    const hintIdx = newText.indexOf("quick "); // 4
    
    const f = fuzzyFind(newText, quote, hintIdx);
    
    // It will find "brown fox jumps over the " (first 32 chars) 
    // wait, "brown " is matched against "brown red fox...".
    
    console.log("Found index:", f.index);
    console.log("Score hardcoded to:", f.score);
    
    // Slicing bug:
    const newTextSlice = newText.slice(f.index, Math.min(newText.length, f.index + quote.length));
    console.log("Original quote length:", quote.length);
    console.log("Sliced new text:", newTextSlice); 
    // EXPECTED: "brown red fox suddenly jumps over"
    // It totally cuts off " the very lazy dog" because insertions increased the length!
  };

  try {
    testDmpLogic();
  } catch (e) {
    console.error("Test execution error:", e);
  }
}

runTests();
