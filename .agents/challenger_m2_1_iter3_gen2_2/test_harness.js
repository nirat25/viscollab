const fs = require('fs');
const diff_match_patch = require('diff-match-patch');

const html = fs.readFileSync('c:/Users/nirat/OneDrive/Continuing_Education/Portfolio/Viscollab/spike-collab/index.html', 'utf8');

// Extract the scripts from index.html
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const scriptContent = scriptMatch[1];

// We can evaluate the functions in a controlled context
const vm = require('vm');
const context = {
  console: console,
  document: {
    getElementById: () => ({ style: {} }),
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
    addEventListener: () => {},
    querySelectorAll: () => [],
  },
  window: {
    getSelection: () => ({ rangeCount: 0 }),
    addEventListener: () => {}
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  diff_match_patch: diff_match_patch,
  CSS: { highlights: { set: () => {} } },
  performance: { now: () => Date.now() },
  Date: Date,
  Math: Math,
  JSON: JSON,
  setTimeout: setTimeout,
  innerWidth: 1024,
  scrollX: 0,
  scrollY: 0,
};

vm.createContext(context);

// We only want to test the logical functions
const functionsToTest = `
  const dmp = new diff_match_patch();
  dmp.Match_Distance = 1000000;
  dmp.Match_Threshold = 0.5;
  
  function fuzzyFind(text,quote,hintIdx){
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
`;

vm.runInContext(functionsToTest, context);

function runTests() {
  console.log("Running Fuzzy Matching Tests...");
  
  const text = "This is a long document where we discuss Vendor A and Vendor B. The recommendation is to migrate the three analytics vendors onto Vendor A next quarter. It will save 52% of costs. We also have some extra padding here to make the document longer. ".repeat(100);
  
  // Test 1: Long spans (>32 chars) and long distances
  const quote = "The recommendation is to migrate the three analytics vendors onto Vendor A next quarter.";
  const hintIdx = text.length - 200; // Force it to search far away
  
  const result1 = context.fuzzyFind(text, quote, hintIdx);
  console.log("Test 1 (Long Span, Long Distance):", result1);
  if (result1.score > 0.6) {
    console.log("✅ PASS: Found long quote at distance");
  } else {
    console.log("❌ FAIL: Did not find long quote");
  }
  
  // Test 2: "never silently re-point"
  // If the quote is completely unrelated, it should return a low score
  const unrelatedQuote = "This text is completely unrelated and should not match anything in the document.";
  const result2 = context.fuzzyFind(text, unrelatedQuote, 0);
  console.log("Test 2 (Unrelated Quote):", result2);
  if (result2.score < 0.6) {
    console.log("✅ PASS: Correctly refused to match unrelated quote");
  } else {
    console.log("❌ FAIL: Silently re-pointed to unrelated text");
  }

  // We can't easily test state race conditions and persistence without the full DOM.
  // But we can check the code logic.
}

runTests();
