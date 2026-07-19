/**
 * Browser-safe subset of the agent API.
 *
 * Keep this entrypoint pure: importing `./index.js` would also load the
 * provider-backed Ask implementation and its Node-only SDK dependencies.
 */

export { generateAgentBrief } from "./brief.js";
export { AGENT_PRESETS, AGENT_PRESET_LABELS } from "./types.js";
export type {
  AgentBrief,
  AgentPreset,
  GroundedAgentAnswer,
  SuggestedReviewerQuestion,
} from "./types.js";
