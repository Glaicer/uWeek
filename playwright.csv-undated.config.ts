import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  testMatch: [
    "csv-undated.spec.ts",
    "csv-undated-lifecycle.spec.ts",
    "csv-import.spec.ts",
    "csv-validation.spec.ts",
    "csv-confirmation.spec.ts",
  ],
  testDir: base.testDir,
  use: { ...base.use, baseURL: "http://127.0.0.1:4199" },
  webServer: {
    command: "pnpm build && pnpm preview --port 4199 --strictPort",
    url: "http://127.0.0.1:4199",
    reuseExistingServer: false,
  },
});
