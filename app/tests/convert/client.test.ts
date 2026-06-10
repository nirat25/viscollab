/**
 * P2-T2 deterministic tests: LLM client (getModel, getProvider, providerInfo)
 *
 * Tests the env-based model selection logic. No actual LLM calls are made.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getModel, getProvider, providerInfo } from "../../src/convert/client.js";

// ── Env isolation helpers ─────────────────────────────────────────────────────

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot: EnvSnapshot) {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const TRACKED_KEYS = [
  "LLM_PROVIDER",
  "CONVERT_MODEL",
  "EDIT_MODEL",
  "JUDGE_MODEL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
];

let snapshot: EnvSnapshot;
beforeEach(() => {
  snapshot = snapshotEnv(TRACKED_KEYS);
});
afterEach(() => {
  restoreEnv(snapshot);
});

// ── getProvider ───────────────────────────────────────────────────────────────

describe("getProvider", () => {
  it("defaults to 'anthropic' when LLM_PROVIDER is not set", () => {
    delete process.env["LLM_PROVIDER"];
    expect(getProvider()).toBe("anthropic");
  });

  it("returns 'openai' when LLM_PROVIDER=openai", () => {
    process.env["LLM_PROVIDER"] = "openai";
    expect(getProvider()).toBe("openai");
  });

  it("returns 'anthropic' for any unknown value", () => {
    process.env["LLM_PROVIDER"] = "groq";
    expect(getProvider()).toBe("anthropic");
  });
});

// ── getModel — default selection ──────────────────────────────────────────────

describe("getModel — anthropic defaults", () => {
  beforeEach(() => {
    delete process.env["LLM_PROVIDER"];
    delete process.env["CONVERT_MODEL"];
    delete process.env["EDIT_MODEL"];
    delete process.env["JUDGE_MODEL"];
  });

  it("returns a claude model for convert role", () => {
    expect(getModel("convert")).toMatch(/claude/i);
  });

  it("returns a claude model for edit role", () => {
    expect(getModel("edit")).toMatch(/claude/i);
  });

  it("returns a claude model for judge role", () => {
    expect(getModel("judge")).toMatch(/claude/i);
  });
});

describe("getModel — openai defaults", () => {
  beforeEach(() => {
    process.env["LLM_PROVIDER"] = "openai";
    delete process.env["CONVERT_MODEL"];
    delete process.env["EDIT_MODEL"];
    delete process.env["JUDGE_MODEL"];
  });

  it("returns a gpt model for convert role", () => {
    expect(getModel("convert")).toMatch(/gpt/i);
  });

  it("returns a gpt model for edit role", () => {
    expect(getModel("edit")).toMatch(/gpt/i);
  });
});

// ── getModel — env override ───────────────────────────────────────────────────

describe("getModel — per-role env override", () => {
  it("CONVERT_MODEL override takes precedence", () => {
    process.env["CONVERT_MODEL"] = "my-custom-model";
    expect(getModel("convert")).toBe("my-custom-model");
  });

  it("EDIT_MODEL override takes precedence", () => {
    process.env["EDIT_MODEL"] = "fast-model-v1";
    expect(getModel("edit")).toBe("fast-model-v1");
  });

  it("JUDGE_MODEL override takes precedence", () => {
    process.env["JUDGE_MODEL"] = "judge-model-v2";
    expect(getModel("judge")).toBe("judge-model-v2");
  });

  it("override works even when provider is openai", () => {
    process.env["LLM_PROVIDER"] = "openai";
    process.env["CONVERT_MODEL"] = "claude-override";
    expect(getModel("convert")).toBe("claude-override");
  });
});

// ── providerInfo ──────────────────────────────────────────────────────────────

describe("providerInfo", () => {
  it("includes the provider name", () => {
    delete process.env["LLM_PROVIDER"];
    const info = providerInfo();
    expect(info).toContain("anthropic");
  });

  it("includes model names for convert and edit roles", () => {
    delete process.env["LLM_PROVIDER"];
    const info = providerInfo();
    expect(info).toContain("convert=");
    expect(info).toContain("edit=");
  });

  it("includes OPENAI_BASE_URL when set", () => {
    process.env["LLM_PROVIDER"] = "openai";
    process.env["OPENAI_BASE_URL"] = "https://openrouter.ai/api/v1";
    const info = providerInfo();
    expect(info).toContain("openrouter.ai");
  });

  it("defaults to api.openai.com when OPENAI_BASE_URL is not set", () => {
    process.env["LLM_PROVIDER"] = "openai";
    delete process.env["OPENAI_BASE_URL"];
    const info = providerInfo();
    expect(info).toContain("api.openai.com");
  });
});

// ── complete() — missing API key errors ──────────────────────────────────────

describe("complete() — missing API key", () => {
  it("throws when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env["LLM_PROVIDER"];
    delete process.env["ANTHROPIC_API_KEY"];
    const { complete } = await import("../../src/convert/client.js");
    await expect(
      complete({ role: "convert", system: "sys", user: "usr" })
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws when OPENAI_API_KEY is missing", async () => {
    process.env["LLM_PROVIDER"] = "openai";
    delete process.env["OPENAI_API_KEY"];
    const { complete } = await import("../../src/convert/client.js");
    await expect(
      complete({ role: "convert", system: "sys", user: "usr" })
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
