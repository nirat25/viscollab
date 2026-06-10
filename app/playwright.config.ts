import { defineConfig, devices } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/render",
  // Only run .spec.ts files; vitest handles .test.ts
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  retries: 0,
  reporter: [["list"]],
  use: {
    // Serve tests from the app directory so file:// paths work for the harness
    baseURL: `file://${join(__dirname, "tests/render")}`,
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
