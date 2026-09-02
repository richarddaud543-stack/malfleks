import { describe, expect, it } from "vitest";

import { checkDestructive } from "./destructive-guard";

const LIVE = "postgresql://postgres:pw@db.nnrcjeowivnbzdkwxxrm.supabase.co:5432/postgres";
const LOCAL = "postgresql://postgres@localhost:5433/malfleks_test";

describe("checkDestructive", () => {
  it("allows localhost with no ceremony — a dev database is meant to be thrown away", () => {
    expect(checkDestructive(LOCAL, undefined).allowed).toBe(true);
    expect(checkDestructive("postgresql://postgres@127.0.0.1:5432/x", undefined).allowed).toBe(true);
  });

  it("refuses a remote host by default", () => {
    const check = checkDestructive(LIVE, undefined);
    expect(check.allowed).toBe(false);
    expect(check.host).toBe("db.nnrcjeowivnbzdkwxxrm.supabase.co");
  });

  it("names the exact opt-in in the refusal, so the message is the fix", () => {
    expect(checkDestructive(LIVE, undefined).reason).toContain(
      "MALFLEKS_DESTRUCTIVE_OK=db.nnrcjeowivnbzdkwxxrm.supabase.co",
    );
  });

  it("allows a remote host when the override names that host", () => {
    expect(checkDestructive(LIVE, "db.nnrcjeowivnbzdkwxxrm.supabase.co").allowed).toBe(true);
  });

  // This is the case the whole design exists for. A blanket `=1` left exported
  // in a shell would still be set after DATABASE_URL moved to another database.
  it("does not carry an override from one host to another", () => {
    expect(checkDestructive(LIVE, "some-other-host.example.com").allowed).toBe(false);
    expect(checkDestructive(LIVE, "1").allowed).toBe(false);
    expect(checkDestructive(LIVE, "true").allowed).toBe(false);
  });

  it("fails closed on a URL it cannot parse", () => {
    expect(checkDestructive("not a url", undefined).allowed).toBe(false);
    expect(checkDestructive("not a url", "anything").allowed).toBe(false);
  });

  // A pooled Supabase string has a different hostname from the direct one, so
  // an override taken from one must not silently cover the other.
  it("treats the pooler host as a distinct host from the direct host", () => {
    const pooled = "postgresql://postgres.ref:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
    expect(checkDestructive(pooled, "db.nnrcjeowivnbzdkwxxrm.supabase.co").allowed).toBe(false);
  });
});
