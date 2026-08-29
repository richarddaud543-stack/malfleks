import path from "node:path";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

import { loadDotEnv } from "./scripts/load-env.mjs";

/**
 * Load `.env` for the test run.
 *
 * Next.js loads `.env` for `next dev` and `next build`, and `prisma.config.ts`
 * loads it for the CLI. **Vitest loads neither**, so before this existed a
 * developer could put a perfectly good `DATABASE_URL` in `.env`, watch every
 * other command pick it up, and still get "Integration tests need a Postgres
 * server" from `npm test` — with nothing on screen to suggest the file was
 * simply never read. It is a bad ten minutes and it is entirely avoidable.
 *
 * An already-exported variable wins, which is what lets CI and one-off runs
 * point the suites at a throwaway server without editing the file.
 */
loadDotEnv(import.meta.dirname);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Spread the defaults rather than replace them: `exclude` is not merged,
    // so writing only our own entry would drop `**/node_modules/**`. There is
    // no longer a carve-out here — the Firestore Security Rules suite that
    // needed the Firebase emulator (and therefore Java, and its own CI job) is
    // gone, and the guarantee it proved now lives in
    // `src/server/orders/saved-requests.integration.test.ts`, which runs with
    // everything else.
    exclude: [...configDefaults.exclude],

    // Vitest's default `hookTimeout` is 10s. The integration suites spend their
    // `beforeAll` creating a schema and shelling out to `prisma migrate deploy`,
    // which is comfortably inside 10s against a local Postgres and comfortably
    // outside it against a hosted one — and Soko's own `DATABASE_URL` points at
    // Supabase in eu-west-1. A timeout there is not a failing test; it is a
    // slow network reported as a bug, which is the most expensive kind of
    // false alarm. `testTimeout` is left at its default on purpose: an
    // individual assertion taking 5s still means something is wrong.
    hookTimeout: 120_000,

    // Forwarded explicitly to the worker processes. `loadDotEnv()` above runs
    // in the main process while the suites run in workers, and Vitest does not
    // copy arbitrary additions to `process.env` across that boundary — only
    // what is named here.
    env: {
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      ...(process.env.TEST_DATABASE_URL
        ? { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL }
        : {}),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
