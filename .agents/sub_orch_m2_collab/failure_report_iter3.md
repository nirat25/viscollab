# Iteration 3 Failure Report

Iteration 3 failed the gate because the Forensic Auditor discovered a severe INTEGRITY VIOLATION in the Worker's implementation of the automated tests.

## Forensic Audit Findings
The implementer created `verify.js` to fulfill the test requirement. However, `verify.js` does not execute or test the actual application logic:
1. **Facade Test**: It verifies identity persistence by checking for hardcoded substrings in the `index.html` source code (e.g., `html.includes("localStorage.setItem(ART_KEY")`) instead of executing behavioral tests.
2. **Self-Certifying Logic**: It copies the application's `locate` logic into the test script as `locate_mock` and tests the mock instead of the actual application code.

This allows the tests to print "PASS" without genuinely verifying the application. This directly violates the prohibition against Facade implementations and Self-certifying tests.

## Application State
The implementation of the logic also has critical bugs:
1. **Fuzzy Match Truncation Bug**: `fuzzyFind` includes the 50-character search margin in the match length if the quote's prefix is edited, causing the score to plunge below the 0.6 threshold and fail.
2. **Disambiguation Teleportation Bug**: It eagerly orphans comments on `bs===0`, completely blocking the fuzzy matcher from finding in-place edits.

## Instructions for Explorers
You are to propose a fix strategy to:
1. Remove the facade tests in `spike-collab/verify.js` and replace them with genuine tests that verify runtime behavior without string-matching the source code or mocking internal application logic.
2. Fix the Fuzzy Match Truncation bug where match length includes the search margin.
3. Fix the Disambiguation Teleportation bug where `bs===0` eagerly orphans comments.

Do NOT implement the code; just propose the strategy in your handoff report.
