// @vitest-environment node
//
// Runs against a real Postgres schema built from the committed migrations,
// for the same reason every other `.integration.test.ts` in this repo does:
// what is under test is the database round trip itself (count, then insert),
// and a mocked Prisma client would return whatever it was told to.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { checkRateLimit } from "./rate-limit";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("rate-limit");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let seq = 0;
function uniqueIdentity(): string {
  seq += 1;
  return `test-caller-${seq}`;
}

describe("checkRateLimit", () => {
  it("allows calls up to the limit, then blocks the next one", async () => {
    const identity = uniqueIdentity();
    const config = { action: "unit-test-action", limit: 2, windowMs: 60_000 };

    expect(await checkRateLimit(identity, config)).toEqual({ allowed: true });
    expect(await checkRateLimit(identity, config)).toEqual({ allowed: true });

    const third = await checkRateLimit(identity, config);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.retryAfterMs).toBeGreaterThan(0);
      expect(third.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("keeps two callers' counts independent", async () => {
    const alice = uniqueIdentity();
    const bob = uniqueIdentity();
    const config = { action: "unit-test-isolated", limit: 1, windowMs: 60_000 };

    expect(await checkRateLimit(alice, config)).toEqual({ allowed: true });
    // Alice is now at her limit; Bob has never been seen and is unaffected.
    expect((await checkRateLimit(alice, config)).allowed).toBe(false);
    expect(await checkRateLimit(bob, config)).toEqual({ allowed: true });
  });

  it("keeps two actions for the same caller independent", async () => {
    const identity = uniqueIdentity();
    const configA = { action: "unit-test-action-a", limit: 1, windowMs: 60_000 };
    const configB = { action: "unit-test-action-b", limit: 1, windowMs: 60_000 };

    expect(await checkRateLimit(identity, configA)).toEqual({ allowed: true });
    // Same person, different action — a full quota on A must not touch B.
    expect(await checkRateLimit(identity, configB)).toEqual({ allowed: true });
    expect((await checkRateLimit(identity, configA)).allowed).toBe(false);
  });

  it("lets a caller back in once their window has passed", async () => {
    const identity = uniqueIdentity();
    // A window short enough to actually elapse inside a test, not mocked —
    // this is exercising the real cleanup-then-count path in checkRateLimit,
    // not a fake clock standing in for it.
    const config = { action: "unit-test-expiry", limit: 1, windowMs: 50 };

    expect(await checkRateLimit(identity, config)).toEqual({ allowed: true });
    expect((await checkRateLimit(identity, config)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await checkRateLimit(identity, config)).toEqual({ allowed: true });
  });

  it("stores the key as `<action>:<identity>`, not raw identity", async () => {
    const identity = uniqueIdentity();
    await checkRateLimit(identity, { action: "unit-test-key-shape", limit: 5, windowMs: 60_000 });

    const row = await getPrisma().rateLimitHit.findFirst({
      where: { key: `unit-test-key-shape:${identity}` },
    });
    expect(row).not.toBeNull();
  });
});
