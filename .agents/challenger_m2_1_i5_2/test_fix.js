const dmp = require('c:/Users/nirat/OneDrive/Continuing_Education/Portfolio/Viscollab/spike-collab/node_modules/diff-match-patch/index.js');

// Mock DOM
function fullText(root) { return root.text; }

// Diff-Match-Patch instance
const dmpInst = new dmp.diff_match_patch();
dmpInst.Match_Distance = 1000000;
dmpInst.Match_Threshold = 0.5;

function fuzzyFind(text, quote, hintIdx) {
  const loc = hintIdx >= 0 ? hintIdx : 0;
  let index = -1, chunkOffset = 0;
  for (let i = 0; i < quote.length; i += 32) {
    const pattern = quote.substring(i, i + 32);
    index = dmpInst.match_main(text, pattern, loc + i);
    if (index !== -1) { chunkOffset = i; break; }
  }
  if (index === -1) return { index: -1, score: 0, length: 0 };
  const baseIndex = Math.max(0, index - chunkOffset);
  const margin = 50, start = Math.max(0, baseIndex - margin), end = Math.min(text.length, baseIndex + quote.length + margin);
  const windowText = text.substring(start, end);
  const diffs = dmpInst.diff_main(quote, windowText);
  dmpInst.diff_cleanupSemantic(diffs);
  let qPos = 0, tPos = 0, matches = 0, sOff = -1, eOff = 0;
  for (const [op, txt] of diffs) {
    if (op === 0) { if (sOff === -1) sOff = tPos; qPos += txt.length; tPos += txt.length; matches += txt.length; eOff = tPos; }
    else if (op === -1) { qPos += txt.length; }
    else if (op === 1) { tPos += txt.length; }
    if (qPos >= quote.length) break;
  }
  if (sOff === -1) sOff = 0;
  const matchLen = eOff - sOff;
  return { index: start + sOff, score: matchLen > 0 ? matches / Math.max(quote.length, matchLen) : 0, length: matchLen };
}

const STALE_WINDOW = 400;
const FUZZY_THRESHOLD = 0.6;

function locate(root, c) {
  const t = c.target;
  const text = fullText(root), q = t.quote, pre = t.prefix, suf = t.suffix;
  if (!q) return {status: 'orphaned'};
  const hits = []; let i = text.indexOf(q); while(i !== -1) { hits.push(i); i = text.indexOf(q, i + 1); }
  if (hits.length > 0) {
    let best = hits[0], bs = 0;
    for (const h of hits) {
      const p = text.slice(Math.max(0, h - pre.length), h), s = text.slice(h + q.length, h + q.length + suf.length);
      const sc = (p.endsWith(pre) ? pre.length : 0) + (s.startsWith(suf) ? suf.length : 0);
      if (sc > bs) { bs = sc; best = h; }
    }
    if (bs > 0) return {status: 'anchored', start: best, end: best + q.length};
  }
  if (pre && suf) {
    const pi = text.indexOf(pre);
    if (pi !== -1) {
      const ap = pi + pre.length, si = text.indexOf(suf, ap);
      if (si !== -1 && si - ap <= STALE_WINDOW) return {status: 'stale', start: ap, end: si, newText: text.slice(ap, si)};
    }
  }
  const hint = pre ? text.indexOf(pre) : -1;
  const f = fuzzyFind(text, q, hint >= 0 ? hint + pre.length : -1);
  if (f.score >= FUZZY_THRESHOLD) {
    const end = Math.min(text.length, f.index + (f.length || q.length));
    return {status: 'stale', start: f.index, end, newText: text.slice(f.index, end), fuzzy: +f.score.toFixed(2)};
  }
  return {status: 'orphaned'};
}

// Tests
const originalText = "Here is some intro text. We are talking about the Apple iPhone 15 Pro. It is a very nice phone.";
const targetQuote = "Apple iPhone 15 Pro";
const targetPrefix = "ing about the ";
const targetSuffix = ". It is a very";

function testCase(name, newText) {
  const c = { target: { type: 'text', quote: targetQuote, prefix: targetPrefix, suffix: targetSuffix } };
  const root = { text: newText };
  const res = locate(root, c);
  console.log(`[${name}]\nText: "${newText}"\nResult:`, res, '\n');
  return res;
}

console.log("=== Disambiguation Teleportation Bug Fix Tests ===\n");

// 1. Single exact hit, context intact
testCase("1. Exact Hit, Context Intact", "Here is some intro text. We are talking about the Apple iPhone 15 Pro. It is a very nice phone.");

// 2. Single exact hit, context changed/lost (Should fall back to fuzzy if it finds the original intent near prefix, or just find it via fuzzy if quote was slightly edited but in this case quote is intact, just context is completely lost)
testCase("2. Single Exact Hit, Context Lost", "Different intro. Nothing matches. Apple iPhone 15 Pro is here. That is all.");

// 3. Single exact hit but teleported (Wait, if quote exactly matches somewhere else but context is lost, what should happen?)
testCase("3. Quote Teleported (Context Lost)", "We are talking about the Appla iPhone 15 Pro. It is a very nice phone. Also, Apple iPhone 15 Pro is mentioned elsewhere.");

// 4. Multiple exact hits, one context intact
testCase("4. Multiple Exact Hits, One Context Intact", "Here is some intro text. We are talking about the Apple iPhone 15 Pro. It is a very nice phone. And also Apple iPhone 15 Pro elsewhere.");

// 5. Multiple exact hits, context completely lost for all
testCase("5. Multiple Exact Hits, No Context", "Apple iPhone 15 Pro. Some words. Apple iPhone 15 Pro.");

// 6. Fuzzy match only
testCase("6. Fuzzy Match", "Here is some intro text. We are talking about the Appla iPhone 15 Pro. It is a very nice phone.");

// 7. Context bracket fallback (prefix and suffix match, but quote inside completely replaced)
testCase("7. Bracket match", "Here is some intro text. We are talking about the Samsung Galaxy S24 Ultra. It is a very nice phone.");

