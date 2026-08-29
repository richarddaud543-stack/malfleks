import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/server/db/database-url";
import { loadDotEnv } from "./scripts/load-env.mjs";

// Prisma 7 dropped automatic `.env` loading, so the CLI would otherwise not see
// a developer's DATABASE_URL. Node's own loader is enough — no dotenv
// dependency — but it needs the BOM handling `loadDotEnv` adds; see that file.
// An already-exported DATABASE_URL wins, so CI and the test suite can point the
// CLI at a throwaway database without the checked-out `.env` overriding them.
loadDotEnv(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // `prisma migrate reset` / `prisma db seed` run this.
    seed: "tsx prisma/seed.ts",
  },
  // Only the CLI (migrate, studio) reads this. The application client gets its
  // connection through a driver adapter in `src/server/db/client.ts`.
  //
  // Supplied only when there is one, and that conditional is load-bearing.
  // `postinstall` runs `prisma generate` on every `npm install`, and generate
  // reads the schema without ever opening a connection — so demanding a URL
  // here breaks `npm ci` on any machine that has not configured a database
  // yet, including a fresh clone and including the migration workflow, whose
  // whole job is to *supply* the URL to a later step. Measured 2026-08-29:
  // `Migrate database #1` failed at `npm ci`, not at the migration.
  //
  // With it absent, generate succeeds and a command that genuinely needs a
  // connection fails with Prisma's own message about a missing datasource URL.
  // The friendly version of that error still lives in `resolveDatabaseUrl()`,
  // where the application runtime hits it — which is where it was needed, and
  // where a missing URL is unambiguously wrong rather than merely early.
  ...(process.env.DATABASE_URL?.trim()
    ? { datasource: { url: resolveDatabaseUrl() } }
    : {}),
});
