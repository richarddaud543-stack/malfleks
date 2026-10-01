/**
 * Single source of truth for the connection string, shared by the Prisma CLI
 * (via `prisma.config.ts`) and the runtime client. If these two ever disagreed,
 * migrations would land in one database and queries would read another.
 *
 * ## Why an unset variable throws instead of falling back
 *
 * This used to return `file:<abs>/prisma/dev.db` when `DATABASE_URL` was unset,
 * which was right while SQLite was a supported provider. Since the move to
 * Postgres it manufactures a connection string that cannot work, and every tool
 * downstream then reports the *symptom* rather than the cause. Measured twice,
 * on a real machine:
 *
 * ```
 * Datasource "db": PostgreSQL database "dev.db" at "file:C:/…/prisma/dev.db"
 * Error: P1013  The provided database string is invalid.
 * ```
 *
 * Nothing in that names the actual problem, which is that a variable is not
 * set. A developer reads `P1013` and goes looking for a malformed URL they
 * never wrote.
 *
 * So: no fallback. The error below says which variable, where it goes, and what
 * it should look like — because the moment someone sees this message is exactly
 * the moment they need those three facts.
 */
export function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    "DATABASE_URL is not set.\n\n" +
      "This app runs on Postgres and has no local fallback — there is nothing " +
      "to connect to without it.\n\n" +
      "Put it in a file called `.env` in the repository root:\n" +
      '  DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"\n\n' +
      "On Windows, check the file is really named `.env` and not `.env.txt` — " +
      "Notepad appends the extension silently and Explorer hides it.\n\n" +
      "`.env.example` documents every variable; docs/deploy.md has the two " +
      "Supabase connection strings and which is for what.",
  );
}

/**
 * Which driver adapter the connection string calls for.
 *
 * Derived from the URL rather than from a separate setting, so there is exactly
 * one thing to change when moving between providers: `DATABASE_URL`. A second
 * `DATABASE_PROVIDER` variable could disagree with the URL, and the failure
 * mode — a Postgres string handed to the SQLite driver — is a confusing crash
 * at first query rather than a clear error at startup.
 *
 * SQLite remains the value for a non-`postgres://` string, but it is no longer a
 * usable fallback: this build's client is generated from a `postgresql` schema,
 * and `assertProviderMatches` in `client.ts` rejects the mismatch with an error
 * that says so. `DATABASE_URL` is required now — `.env.example` has the two
 * connection strings and which is for what.
 */
export function resolveDatabaseProvider(
  url: string = resolveDatabaseUrl(),
): "postgresql" | "sqlite" {
  return /^postgres(ql)?:\/\//i.test(url.trim()) ? "postgresql" : "sqlite";
}
