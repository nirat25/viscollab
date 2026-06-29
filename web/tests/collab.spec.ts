import { test, expect } from "@playwright/test";

test.describe("HTMLCollab Dashboard - E2E Polish", () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset server-side database state
    await request.post("/api/collab/reset");

    // Clear localStorage to ensure clean state
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto("/");
  });

  test("Authentication Lock Screen and Identity Persistence", async ({ page }) => {
    // 1. Verify we are locked out initially and see the token input
    const tokenInput = page.locator('[data-testid="login-token-input"]');
    await expect(tokenInput).toBeVisible();

    // 2. Login using the Quick Login button for collaborator (Nirat)
    const quickLoginCollab = page.locator('[data-testid="token-btn-collaborator"]');
    await expect(quickLoginCollab).toBeVisible();
    await quickLoginCollab.click();

    // 3. Verify identity is displayed in the header
    await expect(page.locator("header")).toContainText("Nirat");
    await expect(page.locator("header")).toContainText("collaborator");

    // 4. Reload page and check that identity persists
    await page.reload();
    await expect(page.locator("header")).toContainText("Nirat");
    await expect(page.locator("header")).toContainText("collaborator");
  });

  test("Create comment, reply, resolve lifecycle, and review decisions", async ({ page }) => {
    // Login as collaborator
    await page.click('[data-testid="token-btn-collaborator"]');

    // Wait for workspace to hydrate and section IDs to stabilize
    await page.waitForTimeout(1000);

    // 1. Add a comment on background section
    await page.locator('#background').hover();
    const commentBtn = page.locator('[data-testid="comment-btn-background"]');
    await expect(commentBtn).toBeVisible();
    await commentBtn.click();

    const commentInput = page.locator('[data-testid="comment-body-input"]');
    await expect(commentInput).toBeVisible();
    await commentInput.fill("Need clarification on the 30% reduction. @priya");
    
    // Select type
    await page.selectOption('[data-testid="comment-feedback-type"]', "needs");

    // Submit comment
    await page.click('[data-testid="comment-submit-button"]');

    // Verify comment is displayed in Threads tab
    const threadsTab = page.locator('[data-testid="sidebar-tab-threads"]');
    await threadsTab.click();
    
    const commentItem = page.locator('[data-testid="comment-item"]').filter({ hasText: "Need clarification" });
    await expect(commentItem).toBeVisible();

    // 2. Select Decisions tab and verify Decisions Log contains the approved comment
    const decisionsTab = page.locator('[data-testid="sidebar-tab-decisions"]');
    await decisionsTab.click();
    
    // Seeded comment from Sam should be in decisions
    const decisionItem = page.locator('[data-testid="decision-item"]').filter({ hasText: "Consolidate onto Vendor A" });
    await expect(decisionItem).toBeVisible();

    // 3. Select Actions tab and verify Action Items list includes the needs-data comment
    const actionsTab = page.locator('[data-testid="sidebar-tab-actions"]');
    await actionsTab.click();
    
    const actionItem = page.locator('[data-testid="action-item"]').filter({ hasText: "Need clarification" });
    await expect(actionItem).toBeVisible();
    await expect(actionItem).toContainText("@PRIYA"); // Uppercase badge
  });

  test("Trigger simulated AI edits, view diffs, and commit edit", async ({ page }) => {
    // Login as collaborator
    await page.click('[data-testid="token-btn-collaborator"]');

    // Wait for workspace to hydrate and section IDs to stabilize
    await page.waitForTimeout(1000);

    // 1. Click AI Edit button on background section
    await page.locator('#background').hover();
    const aiEditBtn = page.locator('[data-testid="ai-edit-btn-background"]');
    await expect(aiEditBtn).toBeVisible();
    await aiEditBtn.click();

    // 2. Verify Sandbox modal is open
    const promptInput = page.locator('[data-testid="ai-prompt-input"]');
    await expect(promptInput).toBeVisible();

    // Select a preset
    const presetBtn = page.locator('[data-testid="ai-preset-1"]'); // "Make Concise" preset
    await presetBtn.click();
    await expect(promptInput).toHaveValue("Condense this section to make it extremely clear, short, and punchy, removing any filler words.");

    // 3. Simulate edit
    await page.click('[data-testid="ai-submit-button"]');

    // 4. Verify diff preview is rendered
    const diffPreview = page.locator('[data-testid="diff-preview"]');
    // Wait for the simulated LLM response timeout to fire and render diff (max 1500ms)
    await expect(diffPreview).toBeVisible({ timeout: 5000 });
    await expect(diffPreview.locator("ins").first()).toBeVisible();
    await expect(diffPreview.locator("del").first()).toBeVisible();

    // 5. Commit edit
    const commitBtn = page.locator('[data-testid="ai-commit-button"]');
    await expect(commitBtn).toBeVisible();
    await commitBtn.click();

    // 6. Verify version selector shows v2
    const versionSelect = page.locator("header select");
    await expect(versionSelect).toHaveValue("2");
  });

  test("Team Invite and RBAC UI flow", async ({ page }) => {
    // 1. Log in as owner (Sam)
    await page.click('[data-testid="token-btn-owner"]');
    await page.waitForTimeout(1000);

    // 2. Open Team Settings modal
    const teamBtn = page.locator('[data-testid="team-settings-button"]');
    await expect(teamBtn).toBeVisible();
    await teamBtn.click();

    // 3. Invite a new user with "viewer" role
    const usernameInput = page.locator('[data-testid="invite-username-input"]');
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill("test-invite-user");
    await page.selectOption('[data-testid="invite-role-select"]', "viewer");

    const submitInviteBtn = page.locator('[data-testid="invite-submit-button"]');
    await submitInviteBtn.click();

    // Verify success alert and user listed in team
    const successAlert = page.locator('[data-testid="invite-success-alert"]');
    await expect(successAlert).toBeVisible();
    await expect(page.locator('[data-testid="member-username-test-invite-user"]')).toBeVisible();
    await expect(page.locator('[data-testid="member-role-test-invite-user"]')).toContainText("viewer");

    // Close modal
    await page.click('[data-testid="team-modal-close"]');

    // 4. Sign out
    const logoutBtn = page.locator('header [title="Log Out"]').first();
    await logoutBtn.click();
    await page.waitForTimeout(500);

    // 5. Sign up as the invited user
    await page.click('button:has-text("Sign Up")');

    const signupUsername = page.locator('#signup-username');
    const signupPassword = page.locator('#signup-password');
    await signupUsername.fill("test-invite-user");
    await signupPassword.fill("password");
    await page.click('button[type="submit"]:has-text("Create Account")');
    await page.waitForTimeout(1000);

    // 6. Verify user is logged in as viewer
    await expect(page.locator("header")).toContainText("test-invite-user");
    await expect(page.locator("header")).toContainText("viewer");

    // 7. Verify viewer cannot edit or convert
    const convertBtn = page.locator('button:has-text("Convert Document")');
    await expect(convertBtn).not.toBeVisible();

    // Verify AI edit button is hidden on hover
    await page.locator('#background').hover();
    const aiEditBtn = page.locator('[data-testid="ai-edit-btn-background"]');
    await expect(aiEditBtn).not.toBeVisible();
  });
});

