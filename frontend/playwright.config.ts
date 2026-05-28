import { defineConfig, devices } from "@playwright/test";

// E2E config. Starts the Vite dev server (which proxies /api + /ws to the backend
// on :8001) unless one is already running.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
