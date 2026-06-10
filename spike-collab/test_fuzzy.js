const dmp_module = require('diff-match-patch');
const dmp = new dmp_module();
dmp.Match_Distance = 1000000;
dmp.Match_Threshold = 0.5;

function fuzzyFind(text,pre,q,suf,hintIdx){
  const searchStr = (pre||"") + q + (suf||"");
  const loc = hintIdx >= 0 ? hintIdx : 0;
  let index = -1, chunkOffset = 0;
  for (let i = 0; i < searchStr.length; i += 32) {
    const pattern = searchStr.substring(i, i + 32);
    index = dmp.match_main(text, pattern, loc + i);
    if (index !== -1) { chunkOffset = i; break; }
  }
  if (index === -1) return { index: -1, score: 0, length: 0 };
  const baseIndex = Math.max(0, index - chunkOffset);
  const margin = 50, start = Math.max(0, baseIndex - margin), end = Math.min(text.length, baseIndex + searchStr.length + margin);
  const windowText = text.substring(start, end);
  const diffs = dmp.diff_main(searchStr, windowText);
  dmp.diff_cleanupSemantic(diffs);
  
  let sPos = 0, tPos = 0, matches = 0, sOff = -1, eOff = 0;
  let qStartOff = -1, qEndOff = -1;
  let qEndOp = null;
  let inEditBlock = false; let qEndCrossedInEditBlock = false;
  const preLen = (pre||"").length;
  const qStart = preLen, qEnd = preLen + q.length;

  for (const [op, txt] of diffs) {
    if (op === 0) {
      inEditBlock = false;
      qEndCrossedInEditBlock = false;
    } else {
      inEditBlock = true;
    }
    for (let i = 0; i < txt.length; i++) {
      if (sPos === qStart && qStartOff === -1 && op !== 1) qStartOff = tPos;
      if (op === 0) {
        if (sOff === -1) sOff = tPos;
        matches++; sPos++; tPos++; eOff = tPos;
      } else if (op === -1) {
        sPos++;
      } else if (op === 1) {
        tPos++;
      }
      if (sPos === qEnd) {
        if (op === 0 || op === -1) {
          qEndOff = tPos;
          qEndOp = op;
          if (op === -1) qEndCrossedInEditBlock = true;
        } else if (op === 1 && qEndOp === -1) {
          qEndOff = tPos;
        }
      } else if (sPos > qEnd && op === 1 && qEndCrossedInEditBlock) {
        qEndOff = tPos;
      }
    }
  }

  if (sOff === -1) sOff = 0;
  if (qStartOff === -1) qStartOff = sOff;
  if (qEndOff === -1) qEndOff = qStartOff;
  
  const fullMatchLen = eOff - sOff;
  const matchLen = qEndOff - qStartOff;
  const score = fullMatchLen > 0 ? matches / Math.max(searchStr.length, fullMatchLen) : 0;
  return { index: start + qStartOff, score, length: matchLen, qStartOff, qEndOff };
}

function test(name, text, pre, q, suf, expected) {
  const res = fuzzyFind(text, pre, q, suf, 0);
  const actual = text.substring(res.index, res.index + res.length);
  if (actual === expected) {
    console.log(`[PASS] ${name}`);
  } else {
    console.log(`[FAIL] ${name}\n  Expected: "${expected}"\n  Actual:   "${actual}"`);
  }
}

// The Overlapping Replacements Bug
// If a deletion crosses qStart or qEnd, ANY subsequent insertion in the same edit block
// is entirely absorbed into the quote bounds.

// 1. Overlapping qStart
// original: "PREFIXQUOTE_SUFFIX"
// replace "XQ" with "HUGE_INSERTION" -> "PREFIHUGE_INSERTIONUOTE_SUFFIX"
// "HUGE_INSERTION" replaces the end of prefix and start of quote.
// The new quote absorbs the ENTIRE insertion. Ideally, we just want the remaining quote.
test("Overlapping qStart", "PREFIHUGE_INSERTIONUOTE_SUFFIX", "PREFIX", "QUOTE", "_SUFFIX", "UOTE");

// 2. Overlapping qEnd
// replace "TE_S" with "HUGE_INSERTION" -> "PREFIXQUOHUGE_INSERTIONUFFIX"
// The new quote absorbs the ENTIRE insertion. Ideally, we just want the remaining quote.
test("Overlapping qEnd", "PREFIXQUOHUGE_INSERTIONUFFIX", "PREFIX", "QUOTE", "_SUFFIX", "QUO");

// 3. Insertion immediately before quote
// Insert "X" after "PREFIX" -> "PREFIXXQUOTE_SUFFIX"
// Excluded from quote correctly.
test("Insertion immediately before", "PREFIXXQUOTE_SUFFIX", "PREFIX", "QUOTE", "_SUFFIX", "QUOTE");

// 4. Insertion immediately after quote
// Insert "X" after "QUOTE" -> "PREFIXQUOTEX_SUFFIX"
// Excluded from quote correctly.
test("Insertion immediately after", "PREFIXQUOTEX_SUFFIX", "PREFIX", "QUOTE", "_SUFFIX", "QUOTE");

// 5. Full deletion
// Replace "QUOTE" with "X" -> "PREFIXX_SUFFIX"
test("Full deletion", "PREFIXX_SUFFIX", "PREFIX", "QUOTE", "_SUFFIX", "X");
