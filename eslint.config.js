import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "services/**", "apps/viewer/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["scripts/**/*.mjs", "*.config.js"], languageOptions: { globals: { process: "readonly", console: "readonly", fetch: "readonly" } } },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["node:*", "@furnus/*", "fs", "path"] }],
    },
  },
  {
    files: ["packages/app/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["node:*", "@furnus/adapter-*", "@furnus/api", "@furnus/mcp-server", "fs", "path"] }],
    },
  },
);
