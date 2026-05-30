// Provider-agnostic LLM client. Cheap OpenAI-compatible provider now, Anthropic
// in production (PRD §9 model tiers) — swap via env, no code change.
//
// Env:
//   LLM_PROVIDER   = "openai" | "anthropic"   (default: "anthropic")
//   ANTHROPIC_API_KEY                          (anthropic)
//   OPENAI_API_KEY                             (openai-compatible)
//   OPENAI_BASE_URL                            (openai-compatible; e.g. OpenRouter/DeepSeek/Groq/Ollama)
//   CONVERT_MODEL / EDIT_MODEL / JUDGE_MODEL   (per-role override; else provider default)

export type Role = "convert" | "edit" | "judge";

type Provider = "openai" | "anthropic";

const PROVIDER: Provider = (process.env.LLM_PROVIDER as Provider) || "anthropic";

// Defaults per role; PRD §9: large model first-gen, fast model edits.
const DEFAULTS: Record<Provider, Record<Role, string>> = {
  anthropic: {
    convert: "claude-opus-4-8",
    edit: "claude-sonnet-4-6",
    judge: "claude-opus-4-8",
  },
  openai: {
    // cheap defaults; override per-role via *_MODEL env to taste
    convert: "gpt-4o-mini",
    edit: "gpt-4o-mini",
    judge: "gpt-4o-mini",
  },
};

const ENV_OVERRIDE: Record<Role, string> = {
  convert: "CONVERT_MODEL",
  edit: "EDIT_MODEL",
  judge: "JUDGE_MODEL",
};

export function getModel(role: Role): string {
  return process.env[ENV_OVERRIDE[role]] || DEFAULTS[PROVIDER][role];
}

export interface CompleteOpts {
  role: Role;
  system: string;
  user: string;
  maxTokens?: number;
}

export async function complete(opts: CompleteOpts): Promise<string> {
  return PROVIDER === "anthropic" ? completeAnthropic(opts) : completeOpenAI(opts);
}

async function completeAnthropic(opts: CompleteOpts): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set (LLM_PROVIDER=anthropic).");
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const res = await client.messages.create({
    model: getModel(opts.role),
    max_tokens: opts.maxTokens ?? 8192,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

async function completeOpenAI(opts: CompleteOpts): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set (LLM_PROVIDER=openai).");
  }
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL, // undefined => api.openai.com
  });
  const res = await client.chat.completions.create({
    model: getModel(opts.role),
    max_tokens: opts.maxTokens ?? 8192,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}

export function providerInfo(): string {
  const base = PROVIDER === "openai" ? process.env.OPENAI_BASE_URL || "api.openai.com" : "anthropic";
  return `${PROVIDER} (${base}) — convert=${getModel("convert")} judge=${getModel("judge")}`;
}
