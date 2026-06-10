const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const filePath = `file:///${path.join(process.cwd(), 'index.html').replace(/\\/g, '/')}`;
  await page.goto(filePath);
  
  await page.click('#editToggle');
  await page.evaluate(() => {
    document.querySelector('#lead').innerHTML += " Duplicated quote test.";
    document.querySelector('#why').innerHTML += " Duplicated quote test.";
  });
  await page.click('#editToggle');

  await page.evaluate(() => {
    window.__spike.addText("Duplicated quote test.", "Disambiguation test comment");
  });

  await page.click('#editToggle');
  await page.evaluate(() => {
    document.querySelector('#lead').innerHTML = document.querySelector('#lead').innerHTML.replace("Duplicated quote test.", "Duplicated edited quote test.");
  });
  await page.click('#editToggle');

  const isStale = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'stale');
  const anchorStatus = await page.evaluate(() => window.__spike.comments[0].anchorStatus);
  console.log('anchorStatus:', anchorStatus);
  console.log('isStale:', isStale);
  
  await browser.close();
})();
