import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * The Security Rules suite, kept out of `npm test` on purpose.
 *
 * It needs the Firebase Emulator Suite, which needs Java. Folding it into the
 * default run would mean every `npm test` on a machine without Java fails for a
 * reason that has nothing to do with the change being tested — and the fix
 * people reach for is to make the suite skip itself, which is how a security
 * suite quietly stops testing anything.
 *
 * So it is a separate command with a separate job in CI:
 *
 *   npm run emulators      # in one terminal (needs Java 11+)
 *   npm run test:rules     # in another
 *
 * Or in one shot, which is what CI does:
 *
 *   npm run test:rules:ci
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/security/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
