import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import landmines from "ultracite/oxlint/landmines";
import solid from "ultracite/oxlint/solid";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  env: core.env,
  extends: [core, solid, tanstack, landmines, antiSlop],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: landmines.jsPlugins,
  overrides: [
    {
      files: ["src/components/detent/components/**"],
      rules: {
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/interactive-supports-focus": "off",
        "jsx-a11y/prefer-tag-over-role": "off",
      },
    },
  ],
});
