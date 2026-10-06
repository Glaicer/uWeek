import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: [
    "csv-storage.spec.ts",
    "csv-snapshot.spec.ts",
    "migration-acceptance.spec.ts",
    "next-launch.spec.ts",
    "next-launch-strict-mode.spec.ts",
    "next-*.spec.ts",
  ],
  use: { baseURL: "http://127.0.0.1:4171", timezoneId: "Europe/Moscow" },
  webServer: {
    command: "pnpm build && pnpm preview --port 4171 --strictPort",
    url: "http://127.0.0.1:4171",
    reuseExistingServer: false,
  },
});
