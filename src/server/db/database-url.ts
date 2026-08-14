import path from "node:path";

/**
 * Where the dev SQLite file lives when `DATABASE_URL` is unset. Kept inside
 * `prisma/` so the database sits next to the migrations that produced it.
 */
const DEFAULT_SQLITE_FILE = "prisma/dev.db";

/**
 * Single source of truth for the connection string, shared by the Prisma CLI
 * (via `prisma.config.ts`) and the runtime client. If these two ever disagreed,
 * migrations would land in one database and queries would read another.
 *
 * The fallback is resolved to an absolute path on purpose: a relative `file:`
 * URL means "relative to the CLI's cwd" in one context and "relative to the
 * importing module" in another, which is a nasty class of bug to debug.
 */
export function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  const absolute = path.resolve(process.cwd(), DEFAULT_SQLITE_FILE);
  return `file:${absolute.replaceAll("\\", "/")}`;
}
