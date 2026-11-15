import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/database";

process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: "src/db/test-setup.ts",
  },
});
