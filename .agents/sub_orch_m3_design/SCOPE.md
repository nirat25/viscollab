# Scope: Milestone 3 - Design Profiles in Conversion

## Architecture
- Target directory: `spike` (specifically `spike/src/convert.ts` and `template.ts`)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | System Prompt | Inject composable design guidance (Tufte, exec-brief) so LLM can auto-pick per doc/section | none | DONE |
| 2 | Eval Harness | Add evaluation criteria for design profiles to `npm run eval` | M3.1 | DONE |
| 3 | Agent Judge Eval | Create separate "Agent as a Judge" eval script verifying HTML structure and quality | M3.2 | DONE |

## Interface Contracts
- Prompt changes must allow the LLM to select design profiles.
- Automated evaluation using LLM as judge must be executable.
