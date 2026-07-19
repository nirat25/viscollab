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
 *   EXTRACT_MODEL
 *   ASK_MODEL
 *   CONVERT_MODEL_FALLBACKS   OpenRouter only — comma-separated fallback
 *   EDIT_MODEL_FALLBACKS      model IDs tried in order if the primary model
 *   JUDGE_MODEL_FALLBACKS     errors, rate-limits, or is unavailable.
 *   EXTRACT_MODEL_FALLBACKS
 *   ASK_MODEL_FALLBACKS
 *
 * When OPENAI_BASE_URL points at OpenRouter, every request is routed to the
 * cheapest available provider for the chosen model (OpenRouter's own default
 * is price-*weighted*, not guaranteed-cheapest — see buildOpenAIRequestBody).
 * Neither this nor the fallback list applies to real api.openai.com or to
 * Anthropic — both are OpenRouter-specific extensions to the wire format.
 */

export type Role = "convert" | "edit" | "judge" | "extract" | "ask";

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
    extract: "claude-sonnet-4-6", // convert tier — semantic extraction needs the large model
    ask:     "claude-haiku-4-5",
  },
  openai: {
    convert: "gpt-4o-mini",
    edit:    "gpt-4o-mini",
    judge:   "gpt-4o-mini",
    extract: "gpt-4o-mini",
    ask:     "gpt-4o-mini",
  },
};

const ROLE_ENV_KEY: Record<Role, string> = {
  convert: "CONVERT_MODEL",
  edit:    "EDIT_MODEL",
  judge:   "JUDGE_MODEL",
  extract: "EXTRACT_MODEL",
  ask:     "ASK_MODEL",
};

const ROLE_FALLBACK_ENV_KEY: Record<Role, string> = {
  convert: "CONVERT_MODEL_FALLBACKS",
  edit:    "EDIT_MODEL_FALLBACKS",
  judge:   "JUDGE_MODEL_FALLBACKS",
  extract: "EXTRACT_MODEL_FALLBACKS",
  ask:     "ASK_MODEL_FALLBACKS",
};

export function getModel(role: Role): string {
  const override = process.env[ROLE_ENV_KEY[role]];
  if (override) return override;
  return DEFAULTS[getProvider()][role];
}

/** True when OPENAI_BASE_URL points at OpenRouter (not real OpenAI or another proxy). */
export function isUsingOpenRouter(): boolean {
  return !!process.env["OPENAI_BASE_URL"]?.includes("openrouter.ai");
}

/**
 * Comma-separated fallback model IDs for the given role, trimmed and with
 * empty entries dropped. Only meaningful on OpenRouter — see
 * buildOpenAIRequestBody.
 */
export function getModelFallbacks(role: Role): string[] {
  const raw = process.env[ROLE_FALLBACK_ENV_KEY[role]];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function providerInfo(): string {
  const provider = getProvider();
  const base =
    provider === "openai"
      ? process.env["OPENAI_BASE_URL"] ?? "api.openai.com"
      : "api.anthropic.com";
  const routing = isUsingOpenRouter() ? " [openrouter: price-sort routing]" : "";
  return `${provider} (${base}) — convert=${getModel("convert")} edit=${getModel("edit")} judge=${getModel("judge")} extract=${getModel("extract")} ask=${getModel("ask")}${routing}`;
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

/**
 * Chat-completion request body for the OpenAI-compatible path. `models` and
 * `provider` are OpenRouter extensions to the OpenAI spec — the official
 * `openai` SDK's types don't model them, which is why completeOpenAI() casts
 * this at the call site instead of typing it as the SDK's own params type.
 */
export interface OpenAIChatRequestBody {
  model?: string;
  models?: string[];
  provider?: { sort: "price"; allow_fallbacks: true };
  max_tokens: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
}

/**
 * Builds the OpenAI-compatible request body. Pure and side-effect-free (no
 * network call) so the OpenRouter-specific behavior below is deterministically
 * testable without mocking the SDK.
 *
 * On OpenRouter:
 *   - provider.sort: "price" always picks the cheapest available provider for
 *     the chosen model. OpenRouter's own unset-sort default is price-
 *     *weighted* across providers, not guaranteed cheapest — sort forces it.
 *   - If *_MODEL_FALLBACKS is set, sends `models: [primary, ...fallbacks]`
 *     instead of a single `model`, so a rate-limited/unavailable primary
 *     model doesn't fail the request outright under public traffic.
 * Neither applies off OpenRouter (real api.openai.com rejects/ignores both).
 */
export function buildOpenAIRequestBody(opts: CompleteOpts): OpenAIChatRequestBody {
  const body: OpenAIChatRequestBody = {
    max_tokens: opts.maxTokens ?? 8192,
    messages: [
      { role: "system", content: opts.system },
      { role: "user",   content: opts.user },
    ],
  };

  const primaryModel = getModel(opts.role);
  if (isUsingOpenRouter()) {
    const fallbacks = getModelFallbacks(opts.role);
    if (fallbacks.length > 0) {
      body.models = [primaryModel, ...fallbacks];
    } else {
      body.model = primaryModel;
    }
    body.provider = { sort: "price", allow_fallbacks: true };
  } else {
    body.model = primaryModel;
  }

  return body;
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
  const body = buildOpenAIRequestBody(opts);
  // `body` is fully typed above; the cast is only to bridge OpenRouter's
  // `models`/`provider` extensions past the openai SDK's stricter params type.
  const res = await client.chat.completions.create(body as any);
  return res.choices[0]?.message?.content ?? "";
}
