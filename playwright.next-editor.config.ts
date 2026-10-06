import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "editor-next*.spec.ts",
    "checklist-next*.spec.ts",
    "legacy-repair-next.spec.ts",
  ],
  use: { baseURL: "http://127.0.0.1:4213", timezoneId: "Europe/Moscow" },
  webServer: {
    command:
      "pnpm build:next && pnpm exec next start --hostname 127.0.0.1 --port 4213",
    url: "http://127.0.0.1:4213",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 180_000,
  },
});
