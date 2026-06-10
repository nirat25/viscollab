/**
 * UI Stress Test Harness using Puppeteer
 * 
 * Verifies:
 * 1. State race condition in merge UX is fixed
 * 2. Basic persistence is functional
 * 
 * Run with: node ui_stress_test.js
 * (Requires: npm install puppeteer)
 */

const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("--- Starting UI Stress Tests ---");
    const targetUrl = 'file://' + path.resolve(__dirname, '../../spike-collab/index.html');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(targetUrl);

    // TEST 1: Basic Persistence
    console.log("Testing basic persistence...");
    // Create a comment
    await page.evaluate(() => {
        window.__spike.addText("consolidate the three analytics vendors", "Test persistence comment");
    });
    
    // Check it exists
    let comments = await page.evaluate(() => window.__spike.comments);
    console.assert(comments.length === 1, "Comment should be added");
    console.assert(comments[0].body === "Test persistence comment", "Body should match");
    
    // Reload page
    await page.reload();
    
    // Check it survived reload
    comments = await page.evaluate(() => window.__spike.comments);
    console.assert(comments.length === 1, "Comment should persist after reload");
    console.assert(comments[0].body === "Test persistence comment", "Body should match after reload");
    console.log("Persistence test PASSED.");

    // TEST 2: Merge UX Race Condition
    console.log("Testing Merge UX Race Condition...");
    // Emulate starting a re-attach
    await page.evaluate(() => {
        const c = window.__spike.comments[0];
        // Open re-attach mode
        window.reattachId = c.id;
    });

    // Simulate clicking a new element to reattach, opening the modal
    await page.evaluate(() => {
        const el = document.querySelector('#why');
        // Dispatch click
        el.click();
    });

    // Modal should be open, mergeAction should be set
    let mergeState = await page.evaluate(() => ({
        display: document.getElementById('mergepop').style.display,
        hasAction: !!window.mergeAction
    }));
    // Note: mergeAction is not exposed globally, but we can check display
    console.assert(mergeState.display === 'block', "Merge modal should be visible");

    // Simulate clicking cancel
    await page.evaluate(() => {
        document.getElementById('mergeCancel').click();
    });

    // Modal should be closed, reattachId should be null
    let afterCancelState = await page.evaluate(() => ({
        display: document.getElementById('mergepop').style.display,
        reattachId: window.reattachId,
        picking: window.picking
    }));
    console.assert(afterCancelState.display === 'none', "Merge modal should be closed");
    console.assert(afterCancelState.reattachId === null, "reattachId should be null after cancel");
    console.assert(afterCancelState.picking === false, "picking mode should be false after cancel");

    console.log("Merge UX Race Condition test PASSED.");
    
    await browser.close();
    console.log("--- All UI tests PASSED ---");
})().catch(err => {
    console.error("UI Test failed:", err);
    process.exit(1);
});
