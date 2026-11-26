import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import landmines from "ultracite/oxlint/landmines";

export default defineConfig({
  env: core.env,
  extends: [core, landmines, antiSlop],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: landmines.jsPlugins,
});
