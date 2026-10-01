import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getPrisma, resetPrisma } from "./client";

/**
 * An isolated Postgres for one integration suite.
 *
 * ## Why a schema and not a database
 *
 * These suites used to build a throwaway SQLite *file*, which was instant and
 * needed nothing installed. Postgres has no equivalent, and the two obvious
 * substitutes are both worse than they look:
 *
 * - `CREATE DATABASE` needs a privilege a managed Postgres often withholds, and
 *   Supabase does not grant it on the free tier at all.
 * - Sharing one database across suites makes them order-dependent, which is the
 *   kind of flake that wastes an afternoon and then hides.
 *
 * A uniquely-named **schema** per suite needs no special privilege, is created
 * and dropped in milliseconds, and is genuinely isolated — Postgres resolves
 * unqualified names through `search_path`, so two suites never see each other's
 * rows. It also means these tests can safely point at a real hosted database
 * without touching anything already in it.
 *
 * ## Why Postgres at all, when SQLite was faster
 *
 * Because of what these particular suites claim to prove. `status.integration`
 * and `submissions.integration` exist to show that two admin tabs racing the
 * same row produce exactly one winner. SQLite serialises writes at the file
 * level; Postgres uses MVCC with row-level locks. A guard that holds under the
 * first says nothing about the second, and production is the second. Proving a
 * concurrency property against an engine you do not ship on is theatre.
 */

/** The server these suites run against. Never the app's own `DATABASE_URL`. */
function testServerUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;

  // Falling back to DATABASE_URL is deliberate and safe *because* every suite
  // works inside its own schema and drops it afterwards — nothing in `public`
  // is read or written. It is what lets `npm test` work with no extra setup for
  // a developer who already has DATABASE_URL pointing at a database.
  const fallback = process.env.DATABASE_URL?.trim();
  if (fallback && /^postgres(ql)?:\/\//i.test(fallback)) return fallback;

  throw new Error(
    "Integration tests need a Postgres server. Set TEST_DATABASE_URL (preferred) " +
      "or DATABASE_URL to a postgres:// connection string.\n" +
      "Locally: docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres -d postgres:17\n" +
      "  then TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres",
  );
}

/** Adds or replaces `?schema=` on a Postgres URL. */
function withSchema(url: string, schema: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

export interface TestDatabase {
  /** The connection string this suite should use, scoped to its own schema. */
  url: string;
  /** The schema name, exposed for assertions and debugging. */
  schema: string;
  /** Drops the schema and disconnects. Safe to call twice. */
  teardown: () => Promise<void>;
}

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const PRISMA_CLI = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");

/**
 * Creates a fresh schema, applies the committed migrations into it, and points
 * the process at it. Call in `beforeAll`; call the returned `teardown` in
 * `afterAll`.
 *
 * `label` only makes the schema name readable when something goes wrong and you
 * are looking at `\dn` in psql.
 */
export async function createTestDatabase(label: string): Promise<TestDatabase> {
  if (!existsSync(PRISMA_CLI)) {
    throw new Error(
      `Prisma CLI not found at ${PRISMA_CLI}. Run "npm install" before the test suite.`,
    );
  }

  const server = testServerUrl();
  // The label is folded to an identifier here, once, rather than trusted from
  // each caller: `error-log` and `rate-limit` passed hyphens, produced
  // `test_rate-limit_...`, and were refused by the client's identifier check
  // -- two whole suites red from the day they were written (17 Sep 2026), and
  // unseen, because nobody had a Postgres to run them against.
  const safeLabel = label.replace(/[^A-Za-z0-9_]/g, "_");
  const schema = `test_${safeLabel}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const url = withSchema(server, schema);

  process.env.DATABASE_URL = url;
  await resetPrisma();

  // `migrate deploy` creates the schema named in the URL if it is missing, so
  // there is no separate CREATE SCHEMA step — and no window where the schema
  // exists but is empty.
  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  return {
    url,
    schema,
    teardown: async () => {
      try {
        // CASCADE because the schema still holds tables. Identifier is
        // interpolated rather than parameterised because Postgres does not
        // accept a bind parameter for a schema name — `schema` is generated
        // here from a UUID and never comes from input, so there is nothing to
        // inject.
        await getPrisma().$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await resetPrisma();
      }
    },
  };
}
