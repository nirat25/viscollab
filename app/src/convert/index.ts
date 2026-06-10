/**
 * Public barrel export for the conversion module (P2-T2).
 * Single import point for consumers (pipeline, API routes, CLI).
 */

export { convertIR, buildPrompt, stripFences, PROMPT_VERSION } from "./convert.js";
export type { ConversionResult } from "./convert.js";

export { validateContract } from "./template.js";
export type { ContractResult } from "./template.js";

export { RENDER_SPEC, DESIGN_PROFILES } from "./template.js";

export { CRITERIA, THRESHOLDS, RUBRIC_VERSION } from "./rubric.js";
export type { Criterion, CriterionId } from "./rubric.js";

export { complete, getModel, getProvider, providerInfo } from "./client.js";
export type { Role, CompleteOpts } from "./client.js";

export { ProgressReporter, silentReporter } from "./progress.js";
export type { ProgressEvent, ProgressStage, ProgressCallback } from "./progress.js";

export { tipTapDocToPromptText } from "./ir-to-text.js";
