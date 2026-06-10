const diff_match_patch = require('diff-match-patch');
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

// TEST 1: Long span (> 32 chars)
const text1 = "This is a very long text that contains a quote. Here is the quote we are looking for: We must consolidate the three analytics vendors onto Vendor A this quarter. It is a long quote and has more than thirty two characters.";
const quote1 = "We must consolidate the three analytics vendors onto Vendor A this quarter.";
console.log("TEST 1 - Long span exact match:", fuzzyFind(text1, quote1, 0));

// TEST 2: Long distance (hint index vs actual index far apart)
const text2 = "a".repeat(100000) + "We must consolidate the three analytics vendors onto Vendor A this quarter." + "b".repeat(1000);
console.log("TEST 2 - Long distance exact match:", fuzzyFind(text2, quote1, 0));

// TEST 3: Partial mismatch, checking never silently re-point
// We check locate() logic to see what it does.
