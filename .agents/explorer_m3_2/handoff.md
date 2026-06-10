# Handoff Report: Milestone 3.2 (Design Profiles Strategy)

## Observation
- `spike/src/template.ts:78-98` defines `RENDER_SPEC`, which provides doc-agnostic rendering instructions.
- `spike/src/convert.ts:11-22` defines the `SYSTEM` prompt that requires the LLM to output "ONLY the HTML fragment. No prose, no markdown fences".
- `spike/src/rubric.ts:21-51` defines `CRITERIA` for automated evaluation. Lines 53-59 define `THRESHOLDS` (graded vs zero-tolerance).
- `spike/src/judge.ts:23-49` dynamically constructs an LLM prompt from the IR, HTML, and the `CRITERIA` block.
- `spike/src/run.ts:68-87` exposes the CLI commands: `convert`, `validate`, `eval`.
- `spike/package.json:7-12` lists the npm scripts.

## Logic Chain
1. **Injecting Design Guidance:** We can define the design profiles (e.g., Tufte, Exec-Brief) in `spike/src/template.ts` and append them to `RENDER_SPEC`. To allow the LLM to auto-pick without breaking the "HTML-only" return constraint in `convert.ts`, we should instruct the LLM to wrap its output in a container with a data attribute (e.g., `<div data-design-profile="tufte">...</div>`).
2. **Adding Eval Criteria:** In `spike/src/rubric.ts`, we will add a new graded criterion (e.g., `e_design_profile_appropriate`) evaluating if the selected profile matches the document's intent and is executed correctly. We add this ID to `THRESHOLDS.gradedCriteria`. We must also pass the profile definitions into the `SYSTEM` or `user` prompt in `spike/src/judge.ts` so the judge knows what the profiles mean.
3. **Agent Judge for Structure/Quality:** A new file `spike/src/agent-judge.ts` is required. Unlike `judge.ts` (which checks semantic fidelity against the IR), this script will take only the HTML and evaluate visual grammar, structural depth, and design profile adherence. We then add a new CLI command `eval-agent` to `spike/src/run.ts` and map it to `"eval:agent": "tsx src/run.ts eval-agent"` in `spike/package.json`.

## Caveats
- If the LLM is asked to just return HTML with a data-attribute, we get no chain-of-thought for *why* it picked a profile. If reasoning is strictly required for debugging, we might need to change `convert.ts` to request a JSON object `{"profile": "...", "html": "..."}`, but that requires more parsing and violates the current strict "HTML-only" prompt. The `data-attribute` approach is safer.
- The Agent Judge output needs a storage mechanism. It could just log to the console, or we could extend `harness.ts` to save its results alongside the fidelity judge.

## Conclusion
To complete Milestone 3, the implementer needs to:
1. Update `template.ts` (`RENDER_SPEC` + `DESIGN_PROFILES`) and parse the choice in `convert.ts`.
2. Update `rubric.ts` (new criterion) and `judge.ts` (inject profiles context).
3. Create `agent-judge.ts`, wire it to `run.ts` as `eval-agent`, and expose it in `package.json`.

## Verification Method
- **Implementation:** Inspect `out/*.html` files to confirm `<div data-design-profile="...">` is present.
- **Eval Execution:** Run `npm run eval` and confirm `e_design_profile_appropriate` appears in the console output and gate report.
- **Agent Eval:** Run `npm run eval:agent` and verify it runs a separate LLM evaluation focused solely on HTML structure and design aesthetics.
