import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-csv*.spec.ts"],
  testIgnore: ["next-csv-storage.spec.ts", "next-csv-snapshot.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4222", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 4222",
    url: "http://127.0.0.1:4222",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
