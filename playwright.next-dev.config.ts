import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-launch-strict-mode.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4202", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 4202",
    url: "http://127.0.0.1:4202",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 120_000,
  },
});
