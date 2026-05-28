import { defineConfig } from "@playwright/test";

// Placeholder — E2E config refined in Phase 1.
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:5173" },
});
