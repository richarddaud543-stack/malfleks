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
const SCHEMA_PROVIDER: "sqlite" | "postgresql" = "postgresql";

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
 * Builds the Postgres adapter, honouring `?schema=` in the connection string.
 *
 * **This is not decoration.** Prisma's own connection layer reads `?schema=`,
 * but a driver adapter does not: the string is handed to `pg`, which has no
 * such parameter and silently ignores it. A client built from
 * `...?schema=test_foo` therefore reads and writes `public` — which is how
 * seven "isolated" test suites all ended up sharing one schema and seeing each
 * other's rows (measured 2026-08-27: a suite pointed at an empty schema
 * returned `public`'s six brands).
 *
 * Two settings are needed, because they cover different query paths:
 *
 * - `{ schema }` makes Prisma **qualify the table names** it generates, which
 *   covers every model query (`db.brand.findMany()` and friends).
 * - `options: -c search_path=...` sets it on the **session**, which covers raw
 *   SQL and anything else that resolves an unqualified name.
 *
 * Either alone leaves a hole. `public` stays on the path so extensions and
 * shared types installed there still resolve.
 */
function postgresAdapter(url: string): PrismaPg {
  const parsed = new URL(url);
  const schema = parsed.searchParams.get("schema")?.trim();
  if (!schema) return new PrismaPg({ connectionString: url });

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(
      `DATABASE_URL has schema="${schema}", which is not a plain identifier. ` +
        `It is interpolated into a session setting, so only [A-Za-z0-9_] is accepted.`,
    );
  }

  return new PrismaPg(
    { connectionString: url, options: `-c search_path=${schema},public` },
    { schema },
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
 * first.
 *
 * The SQLite half is now unreachable in practice — this build is generated from
 * a `postgresql` schema, so `assertProviderMatches` rejects a `file:` URL before
 * the switch is read. It is kept because the switch is the thing that makes the
 * provider a one-line change rather than a rewrite, and deleting it would have
 * to be undone to move back.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.sokoPrisma) {
    const url = resolveDatabaseUrl();
    assertProviderMatches(url);

    const adapter =
      resolveDatabaseProvider(url) === "postgresql"
        ? postgresAdapter(url)
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
