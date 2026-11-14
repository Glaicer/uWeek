import { defineConfig } from "@playwright/test";
import { outbox } from "./tests/mail";

const port = 4172;
const env = {
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_DIST_DIR: ".next-e2e",
  DATABASE_URL: "postgres://yourweek:yourweek@127.0.0.1:5433/yourweek_test",
  BETTER_AUTH_SECRET: "playwright-only-secret-not-for-production-use",
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  MAIL_FROM: "YourWeek <login@example.com>",
  MAIL_OUTBOX_DIR: outbox,
};

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: env.BETTER_AUTH_URL, timezoneId: "Europe/Moscow" },
  webServer: {
    command: `node src/db/migrate.ts && next dev --hostname 127.0.0.1 --port ${port}`,
    url: env.BETTER_AUTH_URL,
    reuseExistingServer: false,
    env,
    timeout: 180_000,
  },
});
