import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "services/**", "apps/viewer/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
