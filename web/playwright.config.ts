import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || "3100");
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 45000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    video: process.env.CHROMIUM_EXECUTABLE_PATH ? "off" : "retain-on-failure",
    // Optional override for environments where Playwright's managed browsers
    // can't be downloaded (e.g. sandboxed CI). Unset locally -> default browser.
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
          args: (process.env.CHROMIUM_EXTRA_ARGS || "")
            .split(" ")
            .filter(Boolean),
        }
      : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    // Phase-9 E2E must never silently attach to a developer's existing
    // server, whose database/session configuration could invalidate the
    // isolated seed and hide authorization regressions.
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60000,
    env: {
      E2E_MODE: process.env.E2E_MODE || "",
      COLLAB_JSON_DB_PATH: process.env.COLLAB_JSON_DB_PATH || "",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "phase9-playwright-secret",
      MOCK_AI: "true",
    },
  },
});
