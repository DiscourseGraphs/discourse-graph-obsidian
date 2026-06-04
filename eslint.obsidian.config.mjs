import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

/** ESLint config matching Obsidian community plugin automated review rules. */
export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "scripts/**"],
  },
]);
