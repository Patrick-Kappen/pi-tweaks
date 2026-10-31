import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["extensions/**/*.test.ts", "test/**/*.test.ts"],
    // The integration tests start the pi CLI.
    testTimeout: 60_000,
    // Hooks run inside git; its variables would point git calls in tests at this repository.
    env: { GIT_DIR: "", GIT_INDEX_FILE: "", GIT_WORK_TREE: "" },
    coverage: {
      provider: "v8",
      include: ["extensions/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "json-summary", "lcov"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
