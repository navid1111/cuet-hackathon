import baseConfig from "@hono/eslint-config";
import tseslint from "typescript-eslint";

export default tseslint.config(...baseConfig, {
  ignores: [
    "node_modules/",
    "dist/",
    "build/",
    "coverage/",
    ".next/",
    ".turbo/",
    "*.min.js",
    "data/",
    "specs/",
  ],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
