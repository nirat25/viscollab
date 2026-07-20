import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "phase9-e2e-password";
const E2E_ENABLED = process.env.E2E_MODE === "true" && Boolean(process.env.E2E_OUTPUT_DIR) && Boolean(process.env.COLLAB_JSON_DB_PATH);
const SEMANTIC_ROOM = "10000000-0000-4000-8000-000000000020";
const LEGACY_ROOM = "10000000-0000-4000-8000-000000000021";
const VIEWER_ID = "10000000-0000-4000-8000-000000000004";

async function signIn(page: Page, username: string) {
  await page.goto("/");
  await page.locator('[data-testid="login-token-input"]').fill(username);
  await page.locator("#signin-password").fill(PASSWORD);
  await page.getByTestId("login-submit-button").click();
  await expect(page.locator("header")).toContainText(username, { timeout: 10_000 });
}

async function signOut(page: Page) {
  // Each role transition must begin without the prior signed JWT. Clearing
  // the browser's real session cookie avoids coupling RBAC coverage to the
  // onboarding tour/drawer, which intentionally intercepts background clicks.
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.locator('[data-testid="login-token-input"]')).toBeVisible();
}

test.describe("Phase 9 account-gated decision rooms", () => {
  test.skip(!E2E_ENABLED, "Run `npm run e2e:seed` with E2E_MODE=true plus explicit temporary E2E_OUTPUT_DIR and COLLAB_JSON_DB_PATH first.");
  test.describe.configure({ mode: "serial" });

  test("real scrypt login imports a MOCK_AI decision room and renders semantic/legacy rooms without overflow", async ({ page, context, request }, testInfo) => {
    const anonymous = await request.get(`/api/collab?documentId=${SEMANTIC_ROOM}`);
    expect(anonymous.status()).toBe(401);
    await signIn(page, "owner");
    await expect(page.getByText("E2E strategy decision").first()).toBeVisible();
    const convert = await context.request.post("/api/collab/convert?workspaceId=10000000-0000-4000-8000-000000000010", {
      data: { gdocHtml: "<h1>Imported E2E decision</h1><p>Approve the import smoke decision.</p>" },
    });
    expect(convert.ok()).toBeTruthy();
    const converted = await convert.json() as { html: string; semanticArtifact?: unknown; visualPlan?: unknown };
    expect(converted.semanticArtifact).toBeTruthy();
    const imported = await context.request.post("/api/collab/documents", {
      data: { name: "Imported E2E decision", html: converted.html, workspaceId: "10000000-0000-4000-8000-000000000010", semanticArtifact: converted.semanticArtifact, visualPlan: converted.visualPlan },
    });
    expect(imported.status()).toBe(201);
    await page.reload();
    const importedDocument = page.getByText("Imported E2E decision", { exact: true }).first();
    await expect(importedDocument).toBeVisible();
    await importedDocument.click();
    expect(await page.locator('[role="tab"]').count()).toBeGreaterThan(1);
    await expect(page.getByText("Imported E2E decision").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("owner-desktop.png"), fullPage: true });

    const tabs = page.locator('[role="tab"]:not([disabled])');
    expect(await tabs.count()).toBeGreaterThan(1);
    await tabs.first().focus();
    await tabs.first().press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

    await page.setViewportSize({ width: 375, height: 844 });
    await expect(page.locator('[role="tablist"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("semantic-mobile.png"), fullPage: true });

    // Direct member catalog, not a guessed/default document id, exposes the
    // legacy fixture alongside the semantic decision room.
    await page.getByText("E2E legacy document", { exact: true }).first().click();
    await expect(page.locator("#legacy-source")).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("legacy-mobile.png"), fullPage: true });
  });

  test("commenter can create an authored thread; viewer is read/Ask-only", async ({ page }) => {
    await signIn(page, "commenter");
    const commenterStateResponse = await page.context().request.get(`/api/collab?documentId=${SEMANTIC_ROOM}`);
    const commenterState = await commenterStateResponse.json() as { revision: number; semanticArtifact: { id: string; primaryDecisionId?: string } };
    const created = await page.context().request.post("/api/collab/commands", {
      data: { documentId: SEMANTIC_ROOM, command: "createComment", expectedRevision: commenterState.revision,
        body: "Commenter-owned Phase 9 thread", feedbackType: "question",
        target: { type: "semantic", artifactId: commenterState.semanticArtifact.id, semanticNodeId: commenterState.semanticArtifact.primaryDecisionId || "decision_1" } },
    });
    expect(created.ok()).toBeTruthy();
    await signOut(page);

    await signIn(page, "viewer");
    const viewerState = await page.context().request.get(`/api/collab?documentId=${SEMANTIC_ROOM}`);
    const viewerRoom = await viewerState.json() as { revision: number; semanticArtifact: { id: string; primaryDecisionId?: string } };
    const forbiddenComment = await page.context().request.post("/api/collab/commands", {
      data: { documentId: SEMANTIC_ROOM, command: "createComment", expectedRevision: viewerRoom.revision,
        body: "Denied", target: { type: "semantic", artifactId: viewerRoom.semanticArtifact.id, semanticNodeId: viewerRoom.semanticArtifact.primaryDecisionId || "decision_1" } },
    });
    expect(forbiddenComment.status()).toBe(403);
    await expect(page.locator('[data-testid="verdict-select"]')).toHaveCount(0);
  });

  test("direct membership revocation clears a stale viewer room", async ({ page, context }) => {
    await signIn(page, "owner");
    const stateResponse = await context.request.get(`/api/collab?documentId=${SEMANTIC_ROOM}`);
    const state = await stateResponse.json() as { revision: number };
    const remove = await context.request.post("/api/collab/commands", {
      data: { documentId: SEMANTIC_ROOM, command: "removeRoomMember", expectedRevision: state.revision, targetAccountId: VIEWER_ID },
    });
    expect(remove.ok()).toBeTruthy();

    await signOut(page);
    await signIn(page, "collaborator");
    const collaboratorState = await context.request.get(`/api/collab?documentId=${SEMANTIC_ROOM}`);
    const collaboratorRoom = await collaboratorState.json() as { revision: number };
    const allowedExport = await context.request.post("/api/collab/export", { data: { documentId: SEMANTIC_ROOM, expectedRevision: collaboratorRoom.revision } });
    expect(allowedExport.ok()).toBeTruthy();
    await signOut(page);
    await signIn(page, "viewer");
    const viewerState = await context.request.get(`/api/collab?documentId=${LEGACY_ROOM}`);
    const viewerRoom = await viewerState.json() as { revision: number };
    const forbiddenExport = await context.request.post("/api/collab/export", { data: { documentId: LEGACY_ROOM, expectedRevision: viewerRoom.revision } });
    expect(forbiddenExport.status()).toBe(403);
    const forbidden = await context.request.get(`/api/collab?documentId=${SEMANTIC_ROOM}`);
    expect(forbidden.status()).toBe(403);
    await page.reload();
    await expect(page.getByText("E2E strategy decision", { exact: true })).toHaveCount(0);
    await expect(page.getByText("E2E legacy document", { exact: true }).first()).toBeVisible();
  });
});
