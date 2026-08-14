import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/server/db/database-url";

// Prisma 7 dropped automatic `.env` loading, so the CLI would otherwise not see
// a developer's DATABASE_URL. Node's own loader is enough — no dotenv dependency.
// An already-exported DATABASE_URL wins, so CI and the test suite can point the
// CLI at a throwaway database without the checked-out `.env` overriding them.
const envFile = path.resolve(process.cwd(), ".env");
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

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
