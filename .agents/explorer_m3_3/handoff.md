# Handoff: Milestone 3 Design Profiles Strategy

## Observation
- `spike/src/convert.ts` uses a doc-agnostic `SYSTEM` prompt that imports `RENDER_SPEC` from `template.ts`.
- `spike/src/template.ts` defines `RENDER_SPEC` with 5 general formatting principles, but no specific design profiles.
- `spike/src/rubric.ts` contains the fidelity criteria for `npm run eval`, which includes 2 graded and 2 zero-tolerance criteria, evaluating semantic fidelity.
- `spike/src/judge.ts` implements the LLM-as-a-judge for fidelity against the source document.
- `spike/src/run.ts` maps CLI arguments to `convert`, `eval`, and `validate` commands.
- `spike/package.json` contains the npm scripts (`convert`, `eval`, `validate`).

## Logic Chain
1. **M3.1 (System Prompt):** To inject composable design guidance, we need to define `DESIGN_PROFILES` in `template.ts`. This string will contain descriptions and tactics for "Tufte" (dense, data-integrated), "Executive Brief" (BLUF, skimmable), etc. We will add a 6th principle to `RENDER_SPEC` instructing the LLM to auto-pick the most appropriate profile for the document or per section. Finally, bump `PROMPT_VERSION` in `convert.ts`.
2. **M3.2 (Eval Harness):** To add evaluation criteria for these design profiles to `npm run eval`, we will add a new graded criterion (e.g., `e_design_profile_applied`) to `CRITERIA` in `rubric.ts`. This criterion will ask the judge if a clear design profile was selected and appropriately applied via HTML formatting. We will also add it to `THRESHOLDS.gradedCriteria` and bump `RUBRIC_VERSION`.
3. **M3.3 (Agent Judge Eval):** The current `judge.ts` is explicitly instructed to check semantic fidelity, not aesthetics. To fulfill M3.3, we will create a new file `spike/src/agent-judge.ts` (modeled on `judge.ts`) with a system prompt casting the LLM as an expert UI/UX judge evaluating HTML structure, cognitive load reduction, and design quality without necessarily comparing to the source text. We will add a new command block in `spike/src/run.ts` and map it to a new npm script `"eval:agent": "tsx src/run.ts eval-agent"` in `package.json`.

## Caveats
- Injecting detailed design profiles into `RENDER_SPEC` will increase token usage in `convert.ts`. Descriptions should be concise and focused on structural tactics (e.g., `<details>`, bolding) rather than CSS.
- Since `judge.ts` handles fidelity and `agent-judge.ts` will handle structure/quality, adding the design profile criteria to `rubric.ts` (M3.2) means the fidelity judge also checks design application. This overlap is intentional per M3.2, but the prompt in `judge.ts` ("semantic fidelity, not aesthetics") might need a slight tweak to avoid confusing the LLM when grading `e_design_profile_applied`.

## Conclusion
The strategy is to:
1. Update `template.ts` with `DESIGN_PROFILES` and an updated `RENDER_SPEC`, bumping the prompt version in `convert.ts`.
2. Update `rubric.ts` with a new `e_design_profile_applied` criterion, adding it to graded thresholds.
3. Create `agent-judge.ts` for standalone HTML structural and quality evaluation, and wire it into `run.ts` and `package.json` as `eval:agent`.

## Verification Method
1. Verify `npm run check` passes after modifying the TypeScript files.
2. Run `npm run eval` and confirm `e_design_profile_applied` appears in the generated CLI output and JSON results.
3. Run `npm run eval:agent` (or equivalent) and ensure it parses the HTML and outputs structural/quality scores.
4. Verify the `PROMPT_VERSION` and `RUBRIC_VERSION` reflect the v3 iterations in `results/eval-*.json`.
