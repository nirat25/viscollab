/**
 * Shared LLM-key detection for the collab API routes.
 *
 * A real Anthropic key is formatted `sk-ant-api03-...`; a real OpenAI key is
 * `sk-...`. The goal here is to DETECT a configured provider key so the edit /
 * regenerate routes actually call the LLM, and to fall back to the deterministic
 * simulation only when no real key is present (or when we are explicitly in a
 * test / mock environment).
 *
 * Test/mock short-circuits (`PLAYWRIGHT_TEST` / `MOCK_AI`) intentionally force
 * simulation regardless of any key that happens to be set.
 */

// Obvious placeholder / example values that must NOT be treated as a real key.
const OPENAI_PLACEHOLDERS = new Set([
  "your-key-here",
  "sk-...",
  "sk-your-key-here",
  "",
]);

/**
 * Returns true when a usable provider LLM key is configured for the active
 * `LLM_PROVIDER`, and we are not in a forced-simulation (test/mock) mode.
 */
export function hasLlmKey(): boolean {
  // Test and mock modes always simulate — never call a real provider.
  if (process.env["PLAYWRIGHT_TEST"] === "true") return false;
  if (process.env["MOCK_AI"] === "true") return false;

  // Provider defaults to anthropic (mirrors app/ getProvider()).
  const provider = process.env["LLM_PROVIDER"] === "openai" ? "openai" : "anthropic";

  if (provider === "anthropic") {
    const key = process.env["ANTHROPIC_API_KEY"]?.trim();
    // Real Anthropic keys start with "sk-ant-". A non-empty value that begins
    // with that prefix is treated as present.
    return !!key && key.startsWith("sk-ant-");
  }

  // provider === "openai"
  const key = process.env["OPENAI_API_KEY"]?.trim();
  return !!key && !OPENAI_PLACEHOLDERS.has(key);
}
