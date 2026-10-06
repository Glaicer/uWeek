import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["drag-*.spec.ts", "placement*.spec.ts"],
  use: { baseURL: "http://127.0.0.1:4177", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4177 --strictPort",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
  },
});
