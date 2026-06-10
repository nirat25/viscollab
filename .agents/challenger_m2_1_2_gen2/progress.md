# Progress

- Read `index.html` and analyzed the implementation.
- Attempted to execute scripts but `run_command` timed out due to user prompt.
- Conducted thorough static analysis and found 3 major bugs:
  - DMP Horizon limit on prefix edit (loc = 0 penalty drops matches far from document start)
  - DMP Highlight truncation (newText extraction uses original string length `q.length` instead of re-calculating boundaries)
  - Re-attach UX state leakage (`setPicking(false)` is missing in the cancellation code path)
- Wrote a JSDOM stress-test generator `verify.js`.
- Created `handoff.md`.
- Last visited: 2026-06-08T12:03:00-07:00
