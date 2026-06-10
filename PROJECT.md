# Project: HTMLCollab MVP Milestones

## Architecture
- HTMLCollab is currently split into two main components/spikes based on requirements:
  - `spike-collab`: Contains collaboration layer features (to be polished).
  - `spike`: Contains conversion system (to be enhanced with design profiles).
- The Stack Decision ADR will inform future greenfield/architecture decisions, deciding the frontend framework, LLM provider + tiers, storage layer, and IR format.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | P1-T3 Stack Decision ADR | Research and write ADR with L8 Engineer persona | none | DONE |
| 2 | P2-T4 Collaboration Polish | `spike-collab`: orphan re-attach, diff-match-patch, mock identity, tests | none | PLANNED |
| 3 | Design Profiles in Conversion | `spike`: design profiles in prompt, eval harness updates, LLM as judge | none | DONE |

## Interface Contracts
- None explicitly defined between milestones as they are somewhat disjoint right now.
