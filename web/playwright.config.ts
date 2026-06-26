import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 45000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
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
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 60000,
    env: {
      PLAYWRIGHT_TEST: "true",
    },
  },
});
