import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:4171", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm build && pnpm preview --port 4171 --strictPort",
    url: "http://127.0.0.1:4171",
    reuseExistingServer: false,
  },
});
