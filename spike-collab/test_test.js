const fs = require('fs');

const text = "Recommendation: consolidate the three analytics vendors onto Vendor A this quarter — it cuts cost ~46% with the lowest migration effort and covers every current use case. Duplicated quote test.";
const q = "Duplicated quote test.";
const pre = text.slice(Math.max(0, text.indexOf(q) - 32), text.indexOf(q));
const suf = text.slice(text.indexOf(q) + q.length, text.indexOf(q) + q.length + 32);

console.log("Original Q:", q);
console.log("Original Pre:", pre);
console.log("Original Suf:", suf);

const newText = text.replace("Duplicated quote test.", "Duplicated edited quote test.");

console.log("New text pre still matches exactly:", newText.includes(pre));
console.log("New text suf still matches exactly:", newText.includes(suf) || suf === '');

