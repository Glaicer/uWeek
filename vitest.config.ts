import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/database";

process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_URL = "http://127.0.0.1:4200";
process.env.BETTER_AUTH_SECRET = "vitest-only-secret-not-for-production-use";
process.env.GOOGLE_CLIENT_ID = "vitest-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "vitest-google-client-secret";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: "src/db/test-setup.ts",
  },
});
