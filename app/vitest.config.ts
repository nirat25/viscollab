import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Allow longer timeout for docx parsing (mammoth can be slow on large files)
    testTimeout: 30000,
  },
});
