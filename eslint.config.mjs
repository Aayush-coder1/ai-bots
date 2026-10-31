import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or vendored, not our source:
    ".trigger/**", // Trigger.dev dev/deploy builds
    ".agents/**", // installed agent skills and their scripts
    ".claude/**",
    ".vercel/**",
    // Copied in by the shadcn and ai-elements CLIs and overwritten when a
    // component is added or updated, so they're kept as upstream ships them.
    "components/ui/**",
    "components/ai-elements/**",
  ]),
]);

export default eslintConfig;
