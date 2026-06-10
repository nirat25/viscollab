const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Challenger - Disambiguation Teleportation edge case', () => {
  let filePath;

  test.beforeAll(() => {
    filePath = `file:///${path.join(process.cwd(), 'index.html').replace(/\\/g, '/')}`;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(filePath);
    await page.evaluate(() => localStorage.clear());
    await page.goto(filePath);
  });

  test('Teleportation occurs when both prefix and suffix are modified but quote remains unchanged', async ({ page }) => {
    await page.click('#editToggle');
    await page.evaluate(() => {
      document.querySelector('#lead').innerHTML += " [prefix B] Duplicated quote test. [suffix B] ";
      document.querySelector('#why').innerHTML += " [prefix A] Duplicated quote test. [suffix A] ";
    });
    await page.click('#editToggle');

    // Add a comment to the second occurrence (A)
    await page.evaluate(() => {
      // Find the second occurrence to add the comment accurately
      const text = window.__spike.fullText();
      const firstIdx = text.indexOf("Duplicated quote test.");
      const secondIdx = text.indexOf("Duplicated quote test.", firstIdx + 1);
      const quote = "Duplicated quote test.";
      
      const pre = text.slice(Math.max(0, secondIdx - 32), secondIdx);
      const suf = text.slice(secondIdx + quote.length, secondIdx + quote.length + 32);
      
      const target = {
        type: 'text',
        quote: quote,
        prefix: pre,
        suffix: suf
      };
      
      const c = { 
        id: 'c_test1', 
        author: 'Nirat', 
        createdAt: Date.now(), 
        body: 'Teleportation challenge comment', 
        feedbackType: null, 
        lifecycle: 'open', 
        anchorStatus: 'anchored', 
        target: target, 
        lastKnownContext: quote, 
        resolution: null, 
        replies: [], 
        mentions: [], 
        history: [] 
      };
      window.__spike.comments.push(c);
      window.__spike.render();
    });

    const commentLoc = page.locator('.cmt').filter({ hasText: 'Teleportation challenge comment' });
    await expect(commentLoc).toBeVisible();

    // Verify it is anchored
    let isAnchored = await page.evaluate(() => window.__spike.comments[0].anchorStatus === 'anchored');
    expect(isAnchored).toBeTruthy();

    // Now edit the prefix and suffix of A, but leave the quote unchanged
    await page.click('#editToggle');
    await page.evaluate(() => {
      let html = document.querySelector('#why').innerHTML;
      html = html.replace("[prefix A]", "[edited pre A]");
      html = html.replace("[suffix A]", "[edited suf A]");
      document.querySelector('#why').innerHTML = html;
    });
    await page.click('#editToggle');

    // Check if it teleported
    const status = await page.evaluate(() => window.__spike.comments[0].anchorStatus);
    const locStart = await page.evaluate(() => window.__spike.comments[0]._loc.start);
    
    // The exact quote is 22 chars. 
    // Is it now stale or anchored at the first occurrence?
    const firstOccurrenceIndex = await page.evaluate(() => window.__spike.fullText().indexOf("Duplicated quote test."));
    const secondOccurrenceIndex = await page.evaluate(() => {
        const text = window.__spike.fullText();
        const f = text.indexOf("Duplicated quote test.");
        return text.indexOf("Duplicated quote test.", f + 1);
    });

    console.log(`Status: ${status}`);
    console.log(`loc.start: ${locStart}`);
    console.log(`firstOccurrence: ${firstOccurrenceIndex}`);
    console.log(`secondOccurrence: ${secondOccurrenceIndex}`);

    // If it teleported, loc.start will be the first occurrence
    expect(locStart).toBe(secondOccurrenceIndex); // We EXPECT it to stay at the second occurrence
  });
});
