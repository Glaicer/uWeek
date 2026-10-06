import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig(
  {
    ignores: ["dist/**", ".next/**", "test-results/**", "playwright-report/**"],
  },
  {
    files: ["**/*.{ts,tsx,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    extends: [
      nextPlugin.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
  },
);
