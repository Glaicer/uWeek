import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-list*.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4212", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build:next && pnpm exec next start --hostname 127.0.0.1 --port 4212",
    url: "http://127.0.0.1:4212",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
