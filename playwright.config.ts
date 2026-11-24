import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./tests/database";
import { testClockCookie } from "./tests/clock";
import { googleClientId } from "./tests/google";
import { outbox } from "./tests/mail";

const port = 4172;
const env = {
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_DIST_DIR: ".next-e2e",
  DATABASE_URL: testDatabaseUrl,
  BETTER_AUTH_SECRET: "playwright-only-secret-not-for-production-use",
  BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
  MAIL_FROM: "uWeek <login@example.com>",
  MAIL_OUTBOX_DIR: outbox,
  TEST_CLOCK_COOKIE: testClockCookie,
  GOOGLE_CLIENT_ID: googleClientId,
  GOOGLE_CLIENT_SECRET: "playwright-google-client-secret",
};

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: env.BETTER_AUTH_URL, timezoneId: "Europe/Moscow" },
  webServer: {
    command: `next dev --hostname 127.0.0.1 --port ${port}`,
    url: env.BETTER_AUTH_URL,
    reuseExistingServer: false,
    env,
    timeout: 180_000,
  },
});
