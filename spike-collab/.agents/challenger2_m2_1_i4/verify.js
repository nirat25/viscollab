const diff_match_patch = require('diff_match_patch');
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
    else if (op === -1) { qPos += txt.length; }
    else if (op === 1) { tPos += txt.length; }
    if (qPos >= quote.length) break;
  }
  if (sOff === -1) sOff = 0;
  const matchLen = eOff - sOff;
  return { index: start + sOff, score: matchLen > 0 ? matches / Math.max(quote.length, matchLen) : 0, length: matchLen };
}

function locate(text, c) {
  const STALE_WINDOW = 400;
  const FUZZY_THRESHOLD = 0.6;
  const t = c.target;
  const q=t.quote, pre=t.prefix, suf=t.suffix;
  if(!q) return {status:'orphaned'};
  const hits=[]; let i=text.indexOf(q); while(i!==-1){ hits.push(i); i=text.indexOf(q,i+1); }
  
  if(hits.length===1) return {status:'anchored',start:hits[0],end:hits[0]+q.length};
  
  if(hits.length>1){ 
    let best=hits[0],bs=0; 
    for(const h of hits){ 
      const p=text.slice(Math.max(0,h-pre.length),h),s=text.slice(h+q.length,h+q.length+suf.length); 
      const sc=(p.endsWith(pre)?pre.length:0)+(s.startsWith(suf)?suf.length:0); 
      if(sc>bs){bs=sc;best=h;} 
    } 
    if(bs>0) return {status:'anchored',start:best,end:best+q.length}; 
  }
  
  if(pre&&suf){ const pi=text.indexOf(pre); if(pi!==-1){ const ap=pi+pre.length, si=text.indexOf(suf,ap); if(si!==-1&&si-ap<=STALE_WINDOW) return {status:'stale',start:ap,end:si,newText:text.slice(ap,si)}; } }
  
  const hint=pre?text.indexOf(pre):-1; const f=fuzzyFind(text,q,hint>=0?hint+pre.length:-1);
  if(f.score>=FUZZY_THRESHOLD){ const end=Math.min(text.length,f.index+(f.length||q.length)); return {status:'stale',start:f.index,end,newText:text.slice(f.index,end),fuzzy:+f.score.toFixed(2)}; }
  return {status:'orphaned'};
}

// Emulate the test
let text = "Recommendation: consolidate the three analytics vendors onto Vendor A this quarter. Duplicated quote test. Some other stuff. Duplicated quote test. Why now.";

// 1. We added comment to the first "Duplicated quote test."
const q = "Duplicated quote test.";
const firstIdx = text.indexOf(q);
const pre = text.slice(Math.max(0, firstIdx - 32), firstIdx);
const suf = text.slice(firstIdx + q.length, firstIdx + q.length + 32);

const c = {
  target: {
    type: 'text',
    quote: q,
    prefix: pre,
    suffix: suf
  }
};

// 2. We edit the first occurrence in place.
text = text.replace("Duplicated quote test.", "Duplicated edited quote test.");

// 3. We run locate
const result = locate(text, c);

console.log(JSON.stringify(result));
