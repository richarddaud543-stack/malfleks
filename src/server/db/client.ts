import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseProvider, resolveDatabaseUrl } from "./database-url";

// Next.js dev reloads modules on every edit. Without a global cache each reload
// would build a new client and a new connection, and the old ones would leak.
const globalForPrisma = globalThis as unknown as {
  sokoPrisma?: PrismaClient;
};

/**
 * The provider this build's generated client is bound to.
 *
 * Kept in sync **by hand** with `datasource db` in `prisma/schema.prisma`,
 * because there is no way to read it back at runtime — and the reason it has to
 * be a constant at all is the finding below.
 */
const SCHEMA_PROVIDER: "sqlite" | "postgresql" = "sqlite";

/**
 * Measured 2026-08-27, answering the question `docs/assignments/forge-09.md`
 * said to settle empirically rather than assume:
 *
 * **One Prisma schema cannot serve both SQLite and Postgres.** Three things
 * were tested, and all three say the same:
 *
 * 1. The committed migrations are provider-specific — they emit `DATETIME` and
 *    `REAL`, where Postgres needs `TIMESTAMP(3)` and `DOUBLE PRECISION`. They
 *    cannot be replayed against Postgres.
 * 2. `provider = env("DATABASE_PROVIDER")` is rejected by `prisma validate`.
 *    The provider must be a literal.
 * 3. The *generated client* is bound to it too. Handing `PrismaPg` to a client
 *    generated from a `sqlite` schema fails at construction with
 *    "not compatible with the provider `sqlite` specified in the Prisma
 *    schema" — so this is not only a Migrate concern, as was assumed.
 *
 * The schema header's claim that everything is Postgres-*compatible* is true:
 * no enum, `Json` or scalar list blocks it, and the full 13-table DDL generates
 * and applies cleanly. What is not true is that one build can serve both.
 *
 * Moving to Postgres therefore requires a decision that is **not** an
 * environment variable — see `docs/deploy.md`. Until it is made, this file
 * refuses a mismatch loudly rather than failing deep inside Prisma with a
 * message that does not say what to do about it.
 */
function assertProviderMatches(url: string): void {
  const wanted = resolveDatabaseProvider(url);
  if (wanted === SCHEMA_PROVIDER) return;

  throw new Error(
    `DATABASE_URL is a ${wanted} connection string, but this build's Prisma ` +
      `client was generated from a "${SCHEMA_PROVIDER}" schema, and Prisma ` +
      `binds the two. Setting DATABASE_URL alone is not enough.\n\n` +
      `To run on ${wanted}: change "provider" in prisma/schema.prisma, ` +
      `regenerate the client, and use a migration set generated for that ` +
      `provider — the committed migrations are ${SCHEMA_PROVIDER}-specific. ` +
      `docs/deploy.md has the steps.`,
  );
}

/**
 * The application's Prisma client.
 *
 * Construction is lazy rather than module-level so the connection string is
 * read at first query, not at import time — that is what lets tests point a
 * fresh database at the repositories without any module mocking.
 *
 * The adapter is chosen from the shape of `DATABASE_URL`: a `postgres://`
 * string gets `PrismaPg`, anything else gets SQLite. Both halves of the switch
 * are real and tested; what the switch alone cannot do is change the provider
 * the client was generated against, which is why `assertProviderMatches` runs
 * first. Leave `DATABASE_URL` unset and `npm run dev` still works against
 * `prisma/dev.db` with no setup, which is a property worth protecting.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.sokoPrisma) {
    const url = resolveDatabaseUrl();
    assertProviderMatches(url);

    const adapter =
      resolveDatabaseProvider(url) === "postgresql"
        ? new PrismaPg({ connectionString: url })
        : new PrismaBetterSqlite3({ url });

    globalForPrisma.sokoPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.sokoPrisma;
}

/**
 * Drops the cached client, disconnecting it first. Intended for tests and
 * one-shot scripts that need to rebind to a different database.
 */
export async function resetPrisma(): Promise<void> {
  const existing = globalForPrisma.sokoPrisma;
  globalForPrisma.sokoPrisma = undefined;
  await existing?.$disconnect();
}
