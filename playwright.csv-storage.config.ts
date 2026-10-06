import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["csv-storage.spec.ts", "csv-snapshot.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4189", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4189 --strictPort",
    url: "http://127.0.0.1:4189",
    reuseExistingServer: false,
  },
});
