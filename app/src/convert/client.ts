/**
 * Provider-agnostic LLM client for HTMLCollab app/ (P2-T2).
 * Productionised from spike/src/client.ts.
 *
 * Env vars:
 *   LLM_PROVIDER       "anthropic" | "openai"   (default: "anthropic")
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY
 *   OPENAI_BASE_URL    optional, for OpenRouter / DeepSeek / Groq / Ollama
 *   CONVERT_MODEL      per-role overrides
 *   EDIT_MODEL
 *   JUDGE_MODEL
 */

export type Role = "convert" | "edit" | "judge";

type Provider = "anthropic" | "openai";

export function getProvider(): Provider {
  const p = process.env["LLM_PROVIDER"] as Provider | undefined;
  return p === "openai" ? "openai" : "anthropic";
}

// Default models per role per provider.
// PRD ADR: Claude 3.5 Sonnet = large/convert tier; Claude 3 Haiku = fast/edit tier.
const DEFAULTS: Record<Provider, Record<Role, string>> = {
  anthropic: {
    convert: "claude-sonnet-4-6",
    edit:    "claude-haiku-4-5",
    judge:   "claude-sonnet-4-6",
  },
  openai: {
    convert: "gpt-4o-mini",
    edit:    "gpt-4o-mini",
    judge:   "gpt-4o-mini",
  },
};

const ROLE_ENV_KEY: Record<Role, string> = {
  convert: "CONVERT_MODEL",
  edit:    "EDIT_MODEL",
  judge:   "JUDGE_MODEL",
};

export function getModel(role: Role): string {
  const override = process.env[ROLE_ENV_KEY[role]];
  if (override) return override;
  return DEFAULTS[getProvider()][role];
}

export function providerInfo(): string {
  const provider = getProvider();
  const base =
    provider === "openai"
      ? process.env["OPENAI_BASE_URL"] ?? "api.openai.com"
      : "api.anthropic.com";
  return `${provider} (${base}) — convert=${getModel("convert")} edit=${getModel("edit")} judge=${getModel("judge")}`;
}

export interface CompleteOpts {
  role: Role;
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Send a completion request to the configured LLM provider.
 * Throws if the API key is missing or the call fails.
 */
export async function complete(opts: CompleteOpts): Promise<string> {
  return getProvider() === "anthropic"
    ? completeAnthropic(opts)
    : completeOpenAI(opts);
}

async function completeAnthropic(opts: CompleteOpts): Promise<string> {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy app/.env.example → app/.env and fill it in."
    );
  }
  // Lazy import so tests that mock this module don't load the SDK unnecessarily.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: getModel(opts.role),
    max_tokens: opts.maxTokens ?? 8192,
    // Prompt caching on the system prompt — saves tokens on repeated convert calls.
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  });
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

async function completeOpenAI(opts: CompleteOpts): Promise<string> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Copy app/.env.example → app/.env and fill it in."
    );
  }
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: key,
    baseURL: process.env["OPENAI_BASE_URL"],
  });
  const res = await client.chat.completions.create({
    model: getModel(opts.role),
    max_tokens: opts.maxTokens ?? 8192,
    messages: [
      { role: "system", content: opts.system },
      { role: "user",   content: opts.user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
