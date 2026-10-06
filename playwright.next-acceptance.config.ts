import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "next-migration-acceptance.spec.ts",
  workers: 1,
  timeout: 240_000,
  use: {
    baseURL: "http://127.0.0.1:4226",
    actionTimeout: 10_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command:
      "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 4226",
    url: "http://127.0.0.1:4226",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
