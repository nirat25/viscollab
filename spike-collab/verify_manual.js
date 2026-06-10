const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const filePath = `file:///${path.join(process.cwd(), 'index.html').replace(/\\/g, '/')}`;
  
  await page.goto(filePath);
  
  try {
    console.log("Adding duplicate quote...");
    await page.click('#editToggle');
    await page.evaluate(() => {
      document.querySelector('#lead').innerHTML += " Duplicated quote test.";
      document.querySelector('#why').innerHTML += " Duplicated quote test.";
    });
    await page.click('#editToggle');

    console.log("Adding comment...");
    await page.evaluate(() => {
      window.__spike.addText("Duplicated quote test.", "Disambiguation test comment");
    });

    console.log("Editing in place...");
    await page.click('#editToggle');
    await page.evaluate(() => {
      document.querySelector('#lead').innerHTML = document.querySelector('#lead').innerHTML.replace("covers every current use case. Duplicated quote test.", "covers NO current use case. Duplicated edited quote test.");
    });
    await page.click('#editToggle');

    const isStale = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'stale');
    console.log("Is Stale? " + isStale);
    
    if (!isStale) {
      const status = await page.evaluate(() => window.__spike.comments[0].anchorStatus);
      console.log("Actual status: " + status);
    }
    
    // Check what text was actually highlighted
    const loc = await page.evaluate(() => window.__spike.comments[0]._loc);
    console.log("Loc result: ", loc);

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
})();
