// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma, resetPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import {
  MAX_SAVED_REQUESTS_PER_CUSTOMER,
  deleteOrderRequestForCustomer,
  listOrderRequestsForCustomer,
  saveOrderRequestForCustomer,
  type SaveOrderRequestInput,
} from "./saved-requests";
import { seedDatabase } from "@/server/db/seed";

/**
 * The guarantee this file inherited.
 *
 * Saved order requests used to live in Firestore, where one customer being
 * unable to read or delete another's was enforced by `firestore.rules` and
 * proved by a 234-line suite running against the Firebase emulator — a Java
 * process, its own CI job, and a whole toolchain kept alive for this one
 * property.
 *
 * That file and that job are gone. **The property is not allowed to go with
 * them**, and this suite is where it now lives. Deleting a security control and
 * its test together is how a codebase quietly loses a guarantee it still
 * advertises, so the tests below are deliberately the same ones, rewritten
 * against the store that replaced it:
 *
 * - a customer reads their own and only their own;
 * - a foreign id deletes nothing and admits nothing;
 * - the owner is taken from the session, never from the payload.
 *
 * Running against real Postgres rather than a mock is the point. A stubbed
 * Prisma client would happily agree that `deleteMany` scoped to a `customerId`
 * deletes nothing — that is the assumption under test, not a fixture.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const INTRUDER = "22222222-2222-4222-8222-222222222222";

const PRODUCT = "toyota-corolla"; // Dar branch, own fleet

let referenceCounter = 0;

function input(overrides: Partial<SaveOrderRequestInput> = {}): SaveOrderRequestInput {
  referenceCounter += 1;
  const base: SaveOrderRequestInput = {
    productId: PRODUCT,
    quantity: "1",
    fullName: "Asha Mwenda",
    phone: "0754123456",
    address: "Mikocheni B, near the Shell station",
    agentId: null,
    // The customer already has these on screen; the server keeps them so both
    // copies of the request name the same thing. Counted rather than random so
    // a failure names a specific row.
    reference: `TOY-DAR-${String(referenceCounter).padStart(4, "0")}`,
    requestedAt: new Date().toISOString(),
  };
  return Object.assign(base, overrides);
}

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("saved_requests");
  await seedDatabase(getPrisma());
});

afterAll(async () => {
  await db.teardown();
});

beforeEach(async () => {
  await getPrisma().savedOrderRequest.deleteMany({});
});

describe("saving", () => {
  it("stores the request and returns its reference", async () => {
    const outcome = await saveOrderRequestForCustomer(OWNER, input());

    expect(outcome.saved).toBe(true);
    if (!outcome.saved) return;
    expect(outcome.reference).toMatch(/^[A-Z]{3}-[A-Z]{3}-[A-Z0-9]{4}$/);
  });

  it("re-derives the money from the catalogue rather than trusting the caller", async () => {
    await saveOrderRequestForCustomer(OWNER, input({ quantity: "3" }));

    const [saved] = await listOrderRequestsForCustomer(OWNER);
    expect(saved.quantity).toBe(3);
    expect(saved.lineTotalTZS).toBe(saved.product.unitPriceTZS * 3);
  });

  it("records savedAt on the server's clock, not the browser's", async () => {
    const before = Date.now();
    await saveOrderRequestForCustomer(OWNER, input());
    const [saved] = await listOrderRequestsForCustomer(OWNER);

    // Never null. Under Firestore this was a sentinel that read back as null
    // until it materialised, and every reader had to cope.
    expect(saved.savedAt).not.toBeNull();
    expect(Date.parse(saved.savedAt)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses beyond the per-customer ceiling", async () => {
    // Seeded directly: going through the action 200 times is 200 transactions
    // and proves nothing the ceiling check does not.
    await getPrisma().savedOrderRequest.createMany({
      data: Array.from({ length: MAX_SAVED_REQUESTS_PER_CUSTOMER }, (_, i) => ({
        customerId: OWNER,
        reference: `TOY-DAR-${String(i).padStart(4, "0")}`,
        requestedAt: new Date(),
        payload: {},
      })),
    });

    const outcome = await saveOrderRequestForCustomer(OWNER, input());
    expect(outcome).toEqual({ saved: false, reason: "quota" });
  });

  it("counts the ceiling per customer, not globally", async () => {
    await getPrisma().savedOrderRequest.createMany({
      data: Array.from({ length: MAX_SAVED_REQUESTS_PER_CUSTOMER }, (_, i) => ({
        customerId: INTRUDER,
        reference: `TOY-DAR-${String(i).padStart(4, "0")}`,
        requestedAt: new Date(),
        payload: {},
      })),
    });

    const outcome = await saveOrderRequestForCustomer(OWNER, input());
    expect(outcome.saved).toBe(true);
  });
});

describe("isolation between customers", () => {
  it("returns only the reading customer's own requests", async () => {
    await saveOrderRequestForCustomer(OWNER, input({ fullName: "Asha Mwenda" }));
    await saveOrderRequestForCustomer(INTRUDER, input({ fullName: "Juma Kileo" }));

    const mine = await listOrderRequestsForCustomer(OWNER);
    expect(mine).toHaveLength(1);
    expect(mine[0].customer.fullName).toBe("Asha Mwenda");

    const theirs = await listOrderRequestsForCustomer(INTRUDER);
    expect(theirs).toHaveLength(1);
    expect(theirs[0].customer.fullName).toBe("Juma Kileo");
  });

  // The one that matters most. This is the Firestore rules suite's
  // "an intruder cannot read another customer's request", restated.
  it("cannot delete another customer's request, and does not confirm it exists", async () => {
    const saved = await saveOrderRequestForCustomer(OWNER, input());
    expect(saved.saved).toBe(true);
    if (!saved.saved) return;

    const outcome = await deleteOrderRequestForCustomer(INTRUDER, saved.id);
    expect(outcome).toEqual({ deleted: false, reason: "not-found" });

    // And the row is still there, untouched.
    expect(await listOrderRequestsForCustomer(OWNER)).toHaveLength(1);
  });

  it("deletes the owner's own request", async () => {
    const saved = await saveOrderRequestForCustomer(OWNER, input());
    if (!saved.saved) throw new Error("setup failed");

    await expect(deleteOrderRequestForCustomer(OWNER, saved.id)).resolves.toEqual({
      deleted: true,
    });
    expect(await listOrderRequestsForCustomer(OWNER)).toHaveLength(0);
  });

  it("reports a second delete of the same id as not-found rather than success", async () => {
    const saved = await saveOrderRequestForCustomer(OWNER, input());
    if (!saved.saved) throw new Error("setup failed");

    await deleteOrderRequestForCustomer(OWNER, saved.id);

    // Firestore's delete() succeeded on a document that never existed, which is
    // why the old code read before deleting. `deleteMany` reports the count, so
    // one statement answers both questions.
    await expect(deleteOrderRequestForCustomer(OWNER, saved.id)).resolves.toEqual({
      deleted: false,
      reason: "not-found",
    });
  });

  it("rejects a malformed id before it reaches the database", async () => {
    await expect(
      deleteOrderRequestForCustomer(OWNER, "../../customers/other"),
    ).resolves.toEqual({ deleted: false, reason: "invalid-id" });
  });
});

describe("ordering", () => {
  it("returns newest first, by when the customer submitted", async () => {
    const now = Date.now();
    await getPrisma().savedOrderRequest.createMany({
      data: [
        { customerId: OWNER, reference: "TOY-DAR-OLD1", requestedAt: new Date(now - 60_000), payload: {} },
        { customerId: OWNER, reference: "TOY-DAR-NEW1", requestedAt: new Date(now), payload: {} },
        { customerId: OWNER, reference: "TOY-DAR-MID1", requestedAt: new Date(now - 30_000), payload: {} },
      ],
    });

    const rows = await getPrisma().savedOrderRequest.findMany({
      where: { customerId: OWNER },
      orderBy: { requestedAt: "desc" },
      select: { reference: true },
    });
    expect(rows.map((r) => r.reference)).toEqual([
      "TOY-DAR-NEW1",
      "TOY-DAR-MID1",
      "TOY-DAR-OLD1",
    ]);
  });

  it("honours the limit", async () => {
    for (let i = 0; i < 5; i += 1) {
      await saveOrderRequestForCustomer(OWNER, input());
    }
    expect(await listOrderRequestsForCustomer(OWNER, 3)).toHaveLength(3);
  });
});

afterAll(async () => {
  await resetPrisma();
});
