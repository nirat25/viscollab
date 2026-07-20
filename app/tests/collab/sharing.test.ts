import { describe, expect, it } from "vitest";
import {
  canComment,
  canEdit,
  canExportAgentData,
  canView,
} from "../../src/collab/sharing.js";

describe("Phase-9 account-required compatibility helpers", () => {
  const doc = { id: "doc-1" };

  it("keeps UI affordances aligned with the direct-membership role matrix", () => {
    expect(canView(doc, "viewer")).toBe(true);
    expect(canComment("viewer")).toBe(false);
    expect(canComment("commenter")).toBe(true);
    expect(canEdit("commenter")).toBe(false);
    expect(canEdit("collaborator")).toBe(true);
    expect(canExportAgentData("collaborator")).toBe(true);
    expect(canExportAgentData("owner")).toBe(true);
    expect(canExportAgentData("viewer")).toBe(false);
    expect(canEdit("unknown")).toBe(false);
  });

  it("denies external access; anonymous token APIs are not exported", () => {
    expect(canView(doc, "viewer", true)).toBe(false);
  });
});
