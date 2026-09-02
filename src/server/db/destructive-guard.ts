/**
 * A stop sign in front of the two commands that can empty the live database.
 *
 * ## Why this exists
 *
 * Since the move to Postgres there is no local SQLite fallback, so a developer's
 * `DATABASE_URL` points at a **real hosted database** — for this project, the
 * production Supabase instance. Two routine commands are destructive against it:
 *
 * - `npm run db:seed` prunes every product not in the seed set.
 * - `npm run db:reset` drops the schema and replays migrations.
 *
 * Both are correct against a throwaway database and catastrophic against a live
 * one, and nothing in their names says which you are pointed at. That gap is
 * the whole hazard: the mistake is one forgotten export away, it is silent, and
 * it is not undoable.
 *
 * ## The rule
 *
 * A connection to **localhost** is assumed disposable and passes. Anything else
 * is assumed live and is refused, unless the operator names the host they mean
 * in `MALFLEKS_DESTRUCTIVE_OK`.
 *
 * Naming the host — rather than a bare `=1` — is deliberate. A blanket opt-in
 * left exported in a shell keeps applying after you switch `DATABASE_URL` to a
 * different database, which is exactly the accident being prevented. A
 * host-specific one stops working the moment the target changes.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

export interface DestructiveCheck {
  allowed: boolean;
  host: string;
  reason: string;
}

/** Pure, so it can be tested without touching an environment. */
export function checkDestructive(url: string, override: string | undefined): DestructiveCheck {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // A malformed URL is not a licence to proceed — the point of this guard is
    // that it fails closed.
    return { allowed: false, host: "(unparseable)", reason: "DATABASE_URL is not a valid URL." };
  }

  if (LOCAL_HOSTS.has(host)) {
    return { allowed: true, host, reason: "local database" };
  }

  if (override?.trim() === host) {
    return { allowed: true, host, reason: "MALFLEKS_DESTRUCTIVE_OK names this host" };
  }

  return {
    allowed: false,
    host,
    reason:
      `DATABASE_URL points at ${host}, which is not localhost. This command ` +
      `deletes data, and against a live database that is not undoable.\n\n` +
      `If you have a backup and you mean it, name the host:\n` +
      `  MALFLEKS_DESTRUCTIVE_OK=${host} <your command>\n\n` +
      `To work against a disposable database instead, point TEST_DATABASE_URL ` +
      `or DATABASE_URL at a local Postgres. docs/deploy.md has both.`,
  };
}

/** Throws unless the current `DATABASE_URL` is safe to destroy. */
export function assertDestructiveAllowed(label: string): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return; // No URL set: the app's own resolver will fail first, and clearly.

  const check = checkDestructive(url, process.env.MALFLEKS_DESTRUCTIVE_OK);
  if (check.allowed) return;

  throw new Error(`Refusing to run ${label}.\n\n${check.reason}`);
}
