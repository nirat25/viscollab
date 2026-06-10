/**
 * Test Harness for Collaboration Polish
 * 
 * Tests:
 * 1. Fuzzy Matching for Long Spans
 * 2. Identity Persistence
 * 3. Comments Re-attach UX
 */

// We mock the dmp library for empirical simulation
const diff_match_patch = require('./dmp_mock.js'); // Assuming we downloaded it

function fuzzyFind(text, quote, hintIdx) {
  const dmp = new diff_match_patch();
  dmp.Match_Distance = 1000;
  dmp.Match_Threshold = 0.5;
  const loc = hintIdx >= 0 ? hintIdx : 0;
  const pattern = quote.substring(0, 32);
  const index = dmp.match_main(text, pattern, loc);
  if (index === -1) return { index: -1, score: 0, length: 0 };
  const margin = 50, start = Math.max(0, index - margin), end = Math.min(text.length, index + quote.length + margin);
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

function testFuzzyLongSpans() {
    console.log("--- Testing Fuzzy Matching for Long Spans ---");
    const originalText = "This is a very long paragraph that goes on and on. It contains multiple sentences. The purpose of this paragraph is to act as a long span of text for testing the fuzzy matching algorithm. If we edit the beginning of this paragraph, what happens?";
    const quote = originalText;
    
    // Case 1: Edit in the middle (first 32 chars intact)
    // First 32 chars: "This is a very long paragraph th"
    const editedText1 = "This is a very long paragraph that goes on and on. It contains SEVERAL sentences. The purpose of this paragraph is to act as a long span of text for testing the fuzzy matching algorithm. If we edit the beginning of this paragraph, what happens?";
    const result1 = fuzzyFind(editedText1, quote, 0);
    console.log("Case 1 (Edit in middle):", result1);

    // Case 2: Edit at the VERY BEGINNING (first 32 chars significantly changed)
    // First 32 chars of quote: "This is a very long paragraph th"
    const editedText2 = "Here is an extended paragraph that goes on and on. It contains multiple sentences. The purpose of this paragraph is to act as a long span of text for testing the fuzzy matching algorithm. If we edit the beginning of this paragraph, what happens?";
    const result2 = fuzzyFind(editedText2, quote, 0);
    console.log("Case 2 (Edit at beginning):", result2);
}

testFuzzyLongSpans();
