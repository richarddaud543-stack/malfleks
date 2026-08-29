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
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
