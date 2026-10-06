import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "backup.spec.ts",
  use: { baseURL: "http://127.0.0.1:4191", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm build && pnpm preview --port 4191 --strictPort",
    url: "http://127.0.0.1:4191",
    reuseExistingServer: false,
  },
});
