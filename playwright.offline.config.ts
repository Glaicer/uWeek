import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "offline*.spec.ts",
  use: { baseURL: "http://127.0.0.1:4182", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm build && pnpm preview --port 4182 --strictPort",
    url: "http://127.0.0.1:4182",
    reuseExistingServer: false,
  },
});
