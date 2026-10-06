import { defineConfig } from "@playwright/test";

const oldCheckout = "/tmp/opencode/nextjs-migration/worktrees/old-8657507";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["next-backup*.spec.ts"],
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:4214", timezoneId: "Europe/Moscow" },
  webServer: [
    {
      command:
        "pnpm build:next && pnpm exec next start --hostname 127.0.0.1 --port 4214",
      url: "http://127.0.0.1:4214",
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 180_000,
    },
    {
      command:
        "pnpm exec vite preview --host 127.0.0.1 --port 4299 --strictPort",
      url: "http://127.0.0.1:4299",
      cwd: oldCheckout,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
