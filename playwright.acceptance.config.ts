import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "migration-acceptance.spec.ts",
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4193",
    actionTimeout: 10_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "pnpm build && pnpm preview --port 4193 --strictPort",
    url: "http://127.0.0.1:4193",
    reuseExistingServer: false,
  },
});
