# Investigation: Design Profiles and Agent as a Judge

## Observation

1. **`spike/src/template.ts`**: Contains `RENDER_SPEC`, which enforces document-agnostic principles (e.g., "SURFACE THE LEAD", "PROGRESSIVE DISCLOSURE") but explicitly leaves the visual grammar and structural template up to the LLM. It currently lacks specific design profiles.
2. **`spike/src/convert.ts`**: Feeds `RENDER_SPEC` directly into the `SYSTEM` prompt for the `convert()` function, telling the model to "determine its type and purpose yourself".
3. **`spike/src/rubric.ts`**: Defines the `CRITERIA` array used for automated evaluation. Currently contains four criteria for *semantic fidelity* (e.g., `a_lead_surfaced`, `c_no_emphasis_inversion`) and `THRESHOLDS` defining `gradedCriteria` and `zeroToleranceCriteria`.
4. **`spike/src/judge.ts`**: The current "Agent as a Judge" script. It evaluates the generated HTML specifically by comparing it to the source `DocIR` to score fidelity.
5. **`spike/src/harness.ts` & `spike/src/run.ts`**: `runEval()` orchestrates parsing, conversion, validation, and judging. It outputs generated artifacts to the `out/` directory. The CLI maps commands via `run.ts` (e.g., `npm run eval` runs the harness).

## Logic Chain

1. **Injecting Design Guidance**: 
   - To let the LLM auto-pick a design style per document/section, we should define a new constant (e.g., `DESIGN_PROFILES`) in `template.ts` outlining distinct styles like "Tufte" (data-heavy, side-notes, high data-ink ratio) and "Exec-Brief" (BLUF, highly scannable, bullet-driven).
   - We then append this to `RENDER_SPEC`, instructing the LLM to select, apply, or mix these profiles based on its assessment of the document.
2. **Adding Eval Criteria for Design Profiles**:
   - Because `judge.ts` automatically maps over the `CRITERIA` array and `harness.ts` automatically tallies thresholds based on `THRESHOLDS`, adding a new criterion to `rubric.ts` (e.g., `e_design_profile_applied`) and adding it to `THRESHOLDS.gradedCriteria` seamlessly integrates it into the existing `npm run eval` command.
3. **Creating a Separate Structure/Quality Judge**:
   - The existing `judge.ts` is explicitly for *fidelity* (requiring both the `DocIR` and the `HTML`).
   - A separate "Agent as a Judge" is needed to evaluate pure structural execution, visual grammar, and design profile adherence without relying on the source document.
   - We should create a new script `spike/src/judge-structure.ts` with a new LLM prompt focusing purely on HTML structure, semantic tag use, cognitive load, and design profile recognition.
   - We can add an `eval-structure` command to `spike/src/run.ts` and `spike/package.json` (`"eval:structure": "tsx src/run.ts eval-structure"`). This command can read existing generated HTML files from the `out/` directory and run `judge-structure.ts` over them.

## Caveats

- **Token Limits / Prompt Complexity**: Adding detailed design profile descriptions to `RENDER_SPEC` will consume more context window and increase prompt complexity, which may degrade performance on some models.
- **Visual Grammar constraints**: Implementing "Tufte" style side-notes requires specific HTML/CSS tricks. The `template.ts` currently enforces a strictly "SAFE PALETTE" (no external CSS/JS). The LLM will need to get creative (e.g., using native `<details>` or specific inline styles) to simulate these designs.
- **Judge Prompt Examples**: The prompt in `judge.ts` uses an outdated ID in its JSON example (`"a_decision_above_fold"` instead of `"a_lead_surfaced"`). It still works because it's just an example, but it should be updated for clarity.

## Conclusion

**Action Plan:**
1. **`spike/src/template.ts`**: Add `DESIGN_PROFILES` text and integrate it into `RENDER_SPEC` with instructions to auto-select based on context.
2. **`spike/src/rubric.ts`**: Add a new `Criterion` (`e_design_profile_applied`) and add it to `THRESHOLDS.gradedCriteria`.
3. **`spike/src/judge-structure.ts`**: Create a new standalone agent-judge script taking only `html` as input, scoring structural and design quality.
4. **`spike/src/run.ts` & `spike/package.json`**: Add an `eval-structure` (or `eval:structure`) target that iterates over artifacts in `out/*.html` and evaluates them using the new structure judge.

## Verification Method

1. **Unit check**: Review `template.ts` to ensure `DESIGN_PROFILES` are included in `RENDER_SPEC`.
2. **Fidelity Eval Check**: Run `npm run eval`. Verify that the new `e_design_profile_applied` criterion appears in the Gate Report output and correctly impacts the pass rate.
3. **Structure Eval Check**: Run `npm run eval:structure`. Verify that it successfully evaluates the `.html` files in the `out/` directory independently of the source IR and outputs a JSON report evaluating the structure and design grammar.
