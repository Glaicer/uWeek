import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "next-board*.spec.ts",
    "next-navigation*.spec.ts",
    "next-layout*.spec.ts",
    "next-first-task.spec.ts",
    "next-launch.spec.ts",
    "next-review-domain.spec.ts",
    "next-review-fixes.spec.ts",
  ],
  use: { baseURL: "http://127.0.0.1:4171", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 4171",
    url: "http://127.0.0.1:4171",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
