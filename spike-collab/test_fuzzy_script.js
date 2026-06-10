const fs = require('fs');
const { JSDOM } = require('jsdom');
// To use diff_match_patch without browser
const diff_match_patch = require('diff-match-patch');

function runTest() {
  const dmp = new diff_match_patch();
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
    const preLen = (pre||"").length;
    const qStart = preLen, qEnd = preLen + q.length;

    for (const [op, txt] of diffs) {
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
          } else if (op === 1 && qEndOp === -1) {
            qEndOff = tPos;
          }
        }
      }
    }

    if (sOff === -1) sOff = 0;
    if (qStartOff === -1) qStartOff = sOff;
    if (qEndOff === -1) qEndOff = qStartOff;
    
    const fullMatchLen = eOff - sOff;
    const matchLen = qEndOff - qStartOff;
    const score = fullMatchLen > 0 ? matches / Math.max(searchStr.length, fullMatchLen) : 0;
    return { index: start + qStartOff, score, length: matchLen };
  }

  // BOF test: no prefix
  const text1 = "Hello world this is a test. We want to find this.";
  const q1 = "Hello world";
  const suf1 = " this is a";
  const res1 = fuzzyFind(text1, "", q1, suf1, 0);
  console.log("BOF:", res1);

  // EOF test: no suffix
  const text2 = "This is a document. And here is the end.";
  const pre2 = "here is the ";
  const q2 = "end.";
  const res2 = fuzzyFind(text2, pre2, q2, "", text2.length - 10);
  console.log("EOF:", res2);

  // Normal test
  const text3 = "Middle of the text to be found.";
  const pre3 = "Middle of ";
  const q3 = "the text";
  const suf3 = " to be";
  const res3 = fuzzyFind(text3, pre3, q3, suf3, 10);
  console.log("Normal:", res3);
}

runTest();
