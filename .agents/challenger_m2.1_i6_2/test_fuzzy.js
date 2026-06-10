const { diff_match_patch } = require('diff-match-patch');
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
  const preLen = (pre||"").length;
  const qStart = preLen, qEnd = preLen + q.length;

  for (const [op, txt] of diffs) {
    let done = false;
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
      if (sPos === qEnd && qEndOff === -1 && op !== 1) qEndOff = tPos;
      if (sPos >= searchStr.length && op !== 1) { done = true; break; }
    }
    if (done) break;
  }

  if (sOff === -1) sOff = 0;
  if (qStartOff === -1) qStartOff = sOff;
  if (qEndOff === -1) qEndOff = qStartOff;
  
  const fullMatchLen = eOff - sOff;
  const matchLen = qEndOff - qStartOff;
  const score = fullMatchLen > 0 ? matches / Math.max(searchStr.length, fullMatchLen) : 0;
  return { index: start + qStartOff, score, length: matchLen };
}

console.log(fuzzyFind("AXBC", "A", "B", "C", 0));
console.log(fuzzyFind("ABXC", "A", "B", "C", 0));
console.log(fuzzyFind("XC", "A", "B", "C", 0));
console.log(fuzzyFind("hello world test", "hello ", "world", " test", 0));
// What if quote is empty?
console.log(fuzzyFind("abc", "a", "", "b", 0));
// What if there is an insertion right at qStart?
console.log(fuzzyFind("hello BIG world", "hello ", "world", "", 0));
