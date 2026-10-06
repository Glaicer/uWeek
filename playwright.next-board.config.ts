import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-board*.spec.ts"],
  testIgnore: ["next-launch*.spec.ts", "next-csv*.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4211", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build:next && pnpm exec next start --hostname 127.0.0.1 --port 4211",
    url: "http://127.0.0.1:4211",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
