import { defineConfig, devices } from "@playwright/test";

/** Screenshots of every route at 1440 and 390 in both themes, into docs/screens. */
export default defineConfig({
  testDir: "e2e",
  testMatch: "screens.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
