const dmp = require('diff-match-patch');
const d = new dmp();
d.Match_Distance = 1000000;
d.Match_Threshold = 0.5;

const quote = "The quick brown fox jumps over the lazy dog";
const pattern = quote.substring(0, 32);

// Typo at location 0 (1 char changed)
// Exact match at location 5000
let text = "The quxck brown fox jumps over the lazy dog" + " ".repeat(4900) + "The quick brown fox jumps over the lazy dog";

const hint = 0;
const index = d.match_main(text, pattern, hint);

console.log("Match index:", index);
console.log("Expected if preferring local typo:", 0);
console.log("Expected if teleporting to exact match:", text.lastIndexOf(pattern));
