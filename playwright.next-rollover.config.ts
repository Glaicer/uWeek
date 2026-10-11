import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-rollover*.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4227", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 4227",
    url: "http://127.0.0.1:4227",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
