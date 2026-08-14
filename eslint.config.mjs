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
    // Agent worktrees live inside the repo and carry their own build output;
    // without this, `npm run lint` reports tens of thousands of problems from
    // other engineers' `.next` chunks instead of this checkout's source.
    ".claude/**",
    "**/.next/**",
  ]),
]);

export default eslintConfig;
