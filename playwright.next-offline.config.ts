import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "next-offline*.spec.ts",
  workers: 1,
  timeout: 300_000,
  use: { baseURL: "http://127.0.0.1:4204", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 4204",
    url: "http://127.0.0.1:4204",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
