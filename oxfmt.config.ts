import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    "/*",
    "!/shared/",
    "!/frontend/",
    "!/cli/",
    "!/package.json",
    "!/*.config.ts",
  ],
});
