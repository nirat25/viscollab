/**
 * SEM-005 deterministic tests: resolveSourceRefs / validateSourceTrace (SEM-003)
 *
 * Verifies the golden artifacts' sourceRefs resolve against their IR fixtures,
 * that a fabricated (unquoted) source ref is rejected, and that blockPath
 * validation catches out-of-range / impossible index paths. Offline, no keys.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSourceRefs, validateSourceTrace } from "../../src/semantic/sourceTrace.js";
import type { SemanticArtifact } from "../../src/semantic/types.js";
import type { TipTapDoc } from "../../src/ir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "../fixtures/semantic");

function loadJSON<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe.each([
  ["founder-memo", "founder-memo.artifact.json", "founder-memo.ir.json"],
  ["dentaltechhub", "dentaltechhub.artifact.json", "dentaltechhub.ir.json"],
] as const)("sourceTrace — %s golden", (_label, artifactFile, irFile) => {
  const artifact = loadJSON<SemanticArtifact>(artifactFile);
  const ir = loadJSON<TipTapDoc>(irFile);

  it("resolveSourceRefs sets charStart/charEnd on every sourceRef", () => {
    const resolved = resolveSourceRefs(artifact, ir);
    for (const node of resolved.nodes) {
      for (const ref of node.sourceRefs) {
        expect(ref.charStart, `node "${node.id}" ref "${ref.quote}" should resolve charStart`).toBeTypeOf(
          "number"
        );
        expect(ref.charEnd, `node "${node.id}" ref "${ref.quote}" should resolve charEnd`).toBeTypeOf(
          "number"
        );
        expect(ref.charEnd!).toBeGreaterThan(ref.charStart!);
      }
    }
  });

  it("resolveSourceRefs does not mutate the input artifact", () => {
    const before = JSON.stringify(artifact);
    resolveSourceRefs(artifact, ir);
    expect(JSON.stringify(artifact)).toBe(before);
  });

  it("validateSourceTrace reports the golden artifact as valid", () => {
    const result = validateSourceTrace(artifact, ir);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe("validateSourceTrace — fabricated quote rejection", () => {
  it("rejects a sourceRef quote that does not appear in the source", () => {
    const artifact = clone(loadJSON<SemanticArtifact>("founder-memo.artifact.json"));
    const ir = loadJSON<TipTapDoc>("founder-memo.ir.json");

    // Fabricate a quote that was never in the memo.
    artifact.nodes[0]!.sourceRefs = [
      { quote: "This sentence was never written in the founder memo and must be rejected." },
    ];

    const result = validateSourceTrace(artifact, ir);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes(artifact.nodes[0]!.id) && e.includes("not found in source")
      )
    ).toBe(true);
  });

  it("resolveSourceRefs leaves charStart/charEnd undefined for a fabricated quote (never throws)", () => {
    const artifact = clone(loadJSON<SemanticArtifact>("founder-memo.artifact.json"));
    const ir = loadJSON<TipTapDoc>("founder-memo.ir.json");
    artifact.nodes[0]!.sourceRefs = [{ quote: "totally fabricated text not present anywhere" }];

    let resolved: SemanticArtifact | undefined;
    expect(() => {
      resolved = resolveSourceRefs(artifact, ir);
    }).not.toThrow();

    const ref = resolved!.nodes[0]!.sourceRefs[0]!;
    expect(ref.charStart).toBeUndefined();
    expect(ref.charEnd).toBeUndefined();
  });
});

describe("validateSourceTrace — blockPath validation", () => {
  it("accepts a blockPath that indexes a real top-level block", () => {
    const artifact = clone(loadJSON<SemanticArtifact>("founder-memo.artifact.json"));
    const ir = loadJSON<TipTapDoc>("founder-memo.ir.json");
    artifact.nodes[0]!.sourceRefs = [
      { quote: "should Anchor Classic be sunset, and if so, on what timeline?", blockPath: [0] },
    ];

    const result = validateSourceTrace(artifact, ir);
    expect(result.valid).toBe(true);
  });

  it("rejects a blockPath with an out-of-range top-level index", () => {
    const artifact = clone(loadJSON<SemanticArtifact>("founder-memo.artifact.json"));
    const ir = loadJSON<TipTapDoc>("founder-memo.ir.json");
    artifact.nodes[0]!.sourceRefs = [
      { quote: "should Anchor Classic be sunset, and if so, on what timeline?", blockPath: [999] },
    ];

    const result = validateSourceTrace(artifact, ir);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes(artifact.nodes[0]!.id) && e.includes("blockPath"))
    ).toBe(true);
  });

  it("rejects a blockPath that digs deeper than the tree allows", () => {
    const artifact = clone(loadJSON<SemanticArtifact>("founder-memo.artifact.json"));
    const ir = loadJSON<TipTapDoc>("founder-memo.ir.json");
    // ir.content[0] is a heading; heading.content holds TextNode leaves with no
    // further `.content` array, so a third index cannot be resolved.
    artifact.nodes[0]!.sourceRefs = [
      { quote: "should Anchor Classic be sunset, and if so, on what timeline?", blockPath: [0, 0, 0] },
    ];

    const result = validateSourceTrace(artifact, ir);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes(artifact.nodes[0]!.id) && e.includes("blockPath"))
    ).toBe(true);
  });

  it("rejects an empty blockPath", () => {
    const artifact = clone(loadJSON<SemanticArtifact>("founder-memo.artifact.json"));
    const ir = loadJSON<TipTapDoc>("founder-memo.ir.json");
    artifact.nodes[0]!.sourceRefs = [
      { quote: "should Anchor Classic be sunset, and if so, on what timeline?", blockPath: [] },
    ];

    const result = validateSourceTrace(artifact, ir);
    expect(result.valid).toBe(false);
  });
});
