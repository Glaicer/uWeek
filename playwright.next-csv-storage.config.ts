import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-csv-storage.spec.ts", "next-csv-snapshot.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4225", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 4225",
    url: "http://127.0.0.1:4225",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 120_000,
  },
});
