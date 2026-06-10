const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;

// Wait a bit for scripts to execute
setTimeout(() => {
    const __spike = window.__spike;
    const document = window.document;
    
    // Simulate the test scenario
    document.querySelector('#lead').innerHTML += " Duplicated quote test.";
    document.querySelector('#why').innerHTML += " Duplicated quote test.";
    
    __spike.addText("Duplicated quote test.", "Disambiguation test comment");
    
    // The comment was added. Let's see its target
    const c = __spike.comments[0];
    console.log("Original comment prefix:", c.target.prefix);
    console.log("Original comment suffix:", c.target.suffix);
    
    // Edit the first occurrence in-place
    document.querySelector('#lead').innerHTML = document.querySelector('#lead').innerHTML.replace("Duplicated quote test.", "Duplicated edited quote test.");
    
    // Now call locate
    const loc = __spike.locate(c);
    console.log("Locate status after edit:", loc.status);
    
    if (loc.status === 'anchored') {
        console.error("BUG CONFIRMED: Teleportation occurred! Comment silently anchored to the wrong occurrence because hits.length === 1.");
        process.exit(1);
    } else {
        console.log("Correct behavior: Status is", loc.status);
        process.exit(0);
    }
}, 500);
