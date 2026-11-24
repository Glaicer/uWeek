import { defineConfig } from "vitest/config";
import { testAuthUrl, testGoogleClientId } from "./tests/auth";
import { testDatabaseUrl } from "./tests/database";

process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_URL = testAuthUrl;
process.env.BETTER_AUTH_SECRET = "vitest-only-secret-not-for-production-use";
process.env.GOOGLE_CLIENT_ID = testGoogleClientId;
process.env.GOOGLE_CLIENT_SECRET = "vitest-google-client-secret";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: "src/db/test-setup.ts",
  },
});
