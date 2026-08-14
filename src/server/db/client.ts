import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./database-url";

// Next.js dev reloads modules on every edit. Without a global cache each reload
// would build a new client and a new SQLite handle, and the old ones would leak.
const globalForPrisma = globalThis as unknown as {
  sokoPrisma?: PrismaClient;
};

/**
 * The application's Prisma client.
 *
 * Construction is lazy rather than module-level so that the connection string
 * is read at first query, not at import time — that is what lets tests point a
 * fresh database at the repositories without any module mocking.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.sokoPrisma) {
    globalForPrisma.sokoPrisma = new PrismaClient({
      // Prisma 7 talks to the database through a driver adapter. Switching to
      // Postgres means swapping this one line for `PrismaPg`.
      adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }),
    });
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
