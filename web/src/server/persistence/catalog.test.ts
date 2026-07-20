import assert from "node:assert/strict";
import test from "node:test";
import { workspaceCatalogProjection } from "./catalog";

const workspace = { id: "workspace", name: "Workspace", ownerAccountId: "owner", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" };

test("workspace catalog capabilities are server-derived from immutable owner identity", () => {
  assert.deepEqual(workspaceCatalogProjection("owner", workspace).capabilities, ["workspace.create_document", "workspace.member_manage"]);
  assert.deepEqual(workspaceCatalogProjection("member", workspace).capabilities, []);
});
