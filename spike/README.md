# P1-T1 — Conversion-fidelity spike + eval harness

Proves (or disproves) the core bet: an LLM can convert **any** document into a structured
artifact that surfaces its load-bearing point without distorting emphasis (PRD §10.1).
**Doc-agnostic** — no per-type template; the LLM judges the document and chooses its own
structure, constrained only by reader-first principles + a safe interaction palette
(`template.ts`). Spike-grade; the `P1-T3` ADR formalizes the production stack.

## Pipeline
`input doc (.docx/.md/.txt)` → **IR** (`parse.ts`) → **convert** (`convert.ts`, model judges
the doc + renders per the `RENDER_SPEC` principles) → **structural+safety validation**
(deterministic, doc-agnostic) → **LLM-as-judge** fidelity scoring (`judge.ts`, `rubric.ts`)
→ results in `results/`.

## Status (2026-05-30)
`npm run convert` **verified end-to-end** — converted the DentalTechHub JTBD doc into a clean
artifact and **surfaced the buried lede** (Part-8 "Steps 4–8" conclusion lifted to the top);
output passes the structural/safety contract. Full eval (`npm run eval`: judge + scores + gate)
is **parked** (plan-mod #3 — conversion judged a commodity).

## Run
```
npm install
cp .env.example .env      # then fill ANTHROPIC_API_KEY (or the OpenAI block); .env is gitignored

# --- or set inline per session instead of .env ---
# OpenAI-compatible (OpenAI, OpenRouter, DeepSeek, Groq, Together, Ollama):
$env:LLM_PROVIDER  = "openai"
$env:OPENAI_API_KEY = "..."
$env:OPENAI_BASE_URL = "https://openrouter.ai/api/v1"   # omit for api.openai.com
$env:CONVERT_MODEL = "openai/gpt-4o-mini"               # any cheap model id
$env:JUDGE_MODEL   = "openai/gpt-4o-mini"

# Production (Anthropic):
# $env:LLM_PROVIDER = "anthropic"; $env:ANTHROPIC_API_KEY = "sk-ant-..."

npm run convert -- golden/<doc>.md        # one doc -> out/<doc>.html + contract check
npm run eval                              # full golden set -> scores + gate report
npm run validate -- out/<doc>.html        # deterministic contract check only (NO key)
npm run check                             # tsc typecheck
```

Provider/model resolve via env (`src/client.ts`): `LLM_PROVIDER` picks the backend,
`CONVERT_MODEL`/`EDIT_MODEL`/`JUDGE_MODEL` override per role. Swapping to Anthropic in
production is an env change — no code change.

## Golden set
Drop real Decision/Approval docs in `golden/`. Optional sidecar `<name>.meta.json`:
```json
{ "highStakes": true, "note": "buried-lede adversarial" }
```
`highStakes` docs enforce the zero-tolerance criteria (c, d) at 100%.

## Status (2026-05-30)
Verified **without** an API key (deterministic):
- ✅ parse `.docx`→IR (mammoth→HTML→IR) and `.md`/`.txt`→IR — table/list/heading extraction correct
- ✅ structural-contract validation — passes `fixtures/good.html`, flags `fixtures/bad.html` (missing regions, broken anchor, non-collapsible detail)
- ✅ `tsc` clean; gate/threshold logic in place

- ✅ real golden doc `golden/dentaltechhub.md` parses: 25 sections, 20 tables, all rows intact (tagged buried-lede / high-stakes — see its `.meta.json`)
- ✅ provider abstraction (OpenAI-compatible + Anthropic), `tsc` clean

Blocked on inputs (NOT yet run end-to-end):
- ⛔ `convert` + `judge` + `eval` gate — need a provider configured (`LLM_PROVIDER` + key)
- once set: `npm run eval` produces the first fidelity scores + gate verdict
