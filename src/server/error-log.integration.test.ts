// @vitest-environment node
//
// Runs against a real Postgres schema, same reason every other
// `.integration.test.ts` in this repo does: this is a real database round
// trip, and a mocked Prisma client would return whatever it was told to.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { logServerError, recentServerErrors } from "./error-log";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("error-log");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

describe("logServerError", () => {
  it("stores a thrown Error's message and stack", async () => {
    await logServerError("unit-test-context", new Error("boom"));

    const rows = await getPrisma().serverErrorLog.findMany({
      where: { context: "unit-test-context" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("boom");
    expect(rows[0]?.stack).toContain("boom");
    expect(rows[0]?.uid).toBeNull();
  });

  it("stores a thrown non-Error by stringifying it, with no stack", async () => {
    await logServerError("unit-test-non-error", "just a string");

    const rows = await getPrisma().serverErrorLog.findMany({
      where: { context: "unit-test-non-error" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("just a string");
    expect(rows[0]?.stack).toBeNull();
  });

  it("records the caller's uid when given one", async () => {
    await logServerError("unit-test-uid", new Error("with a caller"), "uid-123");

    const rows = await getPrisma().serverErrorLog.findMany({
      where: { context: "unit-test-uid" },
    });
    expect(rows[0]?.uid).toBe("uid-123");
  });

  it("truncates an oversized message rather than failing", async () => {
    const huge = "x".repeat(5000);
    await logServerError("unit-test-truncate", new Error(huge));

    const rows = await getPrisma().serverErrorLog.findMany({
      where: { context: "unit-test-truncate" },
    });
    expect(rows[0]?.message.length).toBeLessThanOrEqual(2000);
  });

  it("never throws, even when the identity it's given is malformed", async () => {
    // The whole point of this module is that a broken log call must never
    // become the reason the caller's own error handling fails.
    await expect(
      logServerError("unit-test-safety", new Error("x"), undefined),
    ).resolves.toBeUndefined();
  });
});

describe("recentServerErrors", () => {
  it("returns the newest rows first, most recent context included", async () => {
    await logServerError("unit-test-recent-a", new Error("first"));
    await logServerError("unit-test-recent-b", new Error("second"));

    const recent = await recentServerErrors(50);
    const contexts = recent.map((row) => row.context);
    expect(contexts.indexOf("unit-test-recent-b")).toBeLessThan(
      contexts.indexOf("unit-test-recent-a"),
    );
  });

  it("respects the limit", async () => {
    const recent = await recentServerErrors(1);
    expect(recent.length).toBeLessThanOrEqual(1);
  });
});
