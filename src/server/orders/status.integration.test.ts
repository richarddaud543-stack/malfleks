// @vitest-environment node
//
// Runs against a real Postgres schema built from the committed migrations,
// same reasoning as `review.integration.test.ts`: the property under test is
// that the *database* refuses a second decision on the same order, and a
// mocked Prisma client would simply return whatever it was told to.
//
// The scenario this guards against is named directly in the task that added
// it: two admin tabs open on `/admin/orders`, both clicking "Confirm" (or
// both clicking "Cancel") on the same row. Sequential calls can never
// exercise that — by the time the second call's own pre-check runs, the
// first call's write has already landed and the row is no longer in a
// status the second target is reachable from, so a read-then-write-by-id
// implementation would pass every sequential case here too. Only the
// `Promise.all` cases below genuinely interleave the reads before either
// write, which is what the `updateMany`-with-status-in-WHERE guard exists
// for. Do not delete them.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { seedDatabase } from "@/server/db/seed";
import { createOrder } from "./create-order";
import {
  cancelOrder,
  confirmOrder,
  markOrderFulfilled,
  markOrderFulfilledByPartner,
  orderHistory,
} from "./status";
import type { SaveOrderRequestInput } from "./build-order-request";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("order_status");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

// Same fixture product `create-order.test.ts` uses for its written-row
// assertions — real catalogue data, not a stand-in.
const PRODUCT = "toyota-corolla"; // Dar branch, own fleet

function input(overrides: Partial<SaveOrderRequestInput> = {}): SaveOrderRequestInput {
  return {
    productId: PRODUCT,
    quantity: "1",
    fullName: "Asha Mwenda",
    phone: "0754123456",
    address: "Mikocheni B, near the Shell station",
    agentId: null,
    reference: "",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function pendingOrder() {
  const outcome = await createOrder(input({ reference: "" }), null);
  if (!outcome.ok) throw new Error(`fixture setup failed: ${outcome.reason}`);
  return outcome.value.id;
}

describe("order status transitions — sequential", () => {
  it("confirms a pending order and stamps who and when", async () => {
    const orderId = await pendingOrder();

    await expect(confirmOrder(orderId, "admin-1")).resolves.toEqual({ ok: true });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("confirmed");
    expect(row.decidedBy).toBe("admin-1");
    expect(row.decidedAt).not.toBeNull();
    expect(row.decisionNote).toBeNull();
  });

  it("cancels a pending order and stores the trimmed reason", async () => {
    const orderId = await pendingOrder();

    await expect(cancelOrder(orderId, "admin-1", "  Out of stock  ")).resolves.toEqual({
      ok: true,
    });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("cancelled");
    expect(row.decisionNote).toBe("Out of stock");
  });

  it("stores no note when the cancellation reason was left blank", async () => {
    const orderId = await pendingOrder();
    await cancelOrder(orderId, "admin-1", "   ");

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.decisionNote).toBeNull();
  });

  it("moves confirmed -> fulfilled", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");

    await expect(markOrderFulfilled(orderId, "admin-2")).resolves.toEqual({ ok: true });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("fulfilled");
    expect(row.decidedBy).toBe("admin-2");
  });

  it("moves confirmed -> cancelled", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");

    await expect(cancelOrder(orderId, "admin-2", "Branch declined")).resolves.toEqual({
      ok: true,
    });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("cancelled");
    expect(row.decisionNote).toBe("Branch declined");
  });

  it("refuses to fulfil a still-pending order", async () => {
    const orderId = await pendingOrder();

    await expect(markOrderFulfilled(orderId, "admin-1")).resolves.toEqual({
      ok: false,
      reason: "invalid-transition",
    });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("pending");
    expect(row.decidedBy).toBeNull();
  });

  it("refuses to move a cancelled order anywhere — terminal", async () => {
    const orderId = await pendingOrder();
    await cancelOrder(orderId, "admin-1", "Customer withdrew");

    await expect(confirmOrder(orderId, "admin-2")).resolves.toEqual({
      ok: false,
      reason: "invalid-transition",
    });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    // The first decision stands, untouched by the refused second one.
    expect(row.status).toBe("cancelled");
    expect(row.decidedBy).toBe("admin-1");
    expect(row.decisionNote).toBe("Customer withdrew");
  });

  it("refuses to move a fulfilled order anywhere — terminal", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await markOrderFulfilled(orderId, "admin-1");

    await expect(cancelOrder(orderId, "admin-2", "too late")).resolves.toEqual({
      ok: false,
      reason: "invalid-transition",
    });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("fulfilled");
  });

  it("reports a missing order without inventing one", async () => {
    await expect(confirmOrder("no-such-id", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(cancelOrder("no-such-id", "admin-1", "")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(markOrderFulfilled("no-such-id", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("order status transitions — a truly concurrent race, exactly one wins", () => {
  it("two admin tabs both clicking Confirm on the same pending order: exactly one wins", async () => {
    const orderId = await pendingOrder();

    const [r1, r2] = await Promise.all([
      confirmOrder(orderId, "admin-1"),
      confirmOrder(orderId, "admin-2"),
    ]);

    expect(r1.ok && r2.ok, "both concurrent confirms must never both succeed").toBe(
      false
    );
    expect(r1.ok || r2.ok, "exactly one of the two must succeed").toBe(true);

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("confirmed");
    expect(["admin-1", "admin-2"]).toContain(row.decidedBy);
  });

  it("two admin tabs both clicking Cancel on the same pending order: exactly one wins", async () => {
    const orderId = await pendingOrder();

    const [r1, r2] = await Promise.all([
      cancelOrder(orderId, "admin-1", "Out of stock"),
      cancelOrder(orderId, "admin-2", "Customer withdrew"),
    ]);

    expect(r1.ok && r2.ok, "both concurrent cancels must never both succeed").toBe(
      false
    );
    expect(r1.ok || r2.ok, "exactly one of the two must succeed").toBe(true);

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("cancelled");
    // Whichever admin's write actually landed, the note is theirs — not a
    // blend, and not the loser's.
    if (row.decidedBy === "admin-1") {
      expect(row.decisionNote).toBe("Out of stock");
    } else {
      expect(row.decidedBy).toBe("admin-2");
      expect(row.decisionNote).toBe("Customer withdrew");
    }
  });

  it("two admin tabs both clicking Mark fulfilled on the same confirmed order: exactly one wins", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-0");

    const [r1, r2] = await Promise.all([
      markOrderFulfilled(orderId, "admin-1"),
      markOrderFulfilled(orderId, "admin-2"),
    ]);

    expect(r1.ok && r2.ok, "both concurrent fulfilments must never both succeed").toBe(
      false
    );
    expect(r1.ok || r2.ok, "exactly one of the two must succeed").toBe(true);

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("fulfilled");
  });
});

describe("the OrderEvent history", () => {
  it("records nothing for an order that has never moved", async () => {
    const orderId = await pendingOrder();
    await expect(orderHistory(orderId)).resolves.toEqual([]);
  });

  it("appends one event per transition, oldest first, with the real from-status", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await markOrderFulfilled(orderId, "admin-2");

    const events = await orderHistory(orderId);
    expect(events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      ["pending", "confirmed"],
      ["confirmed", "fulfilled"],
    ]);
    expect(events.map((e) => e.actorUid)).toEqual(["admin-1", "admin-2"]);
  });

  it("carries the cancellation reason onto the event, trimmed like the order's own note", async () => {
    const orderId = await pendingOrder();
    await cancelOrder(orderId, "admin-1", "  Branch declined  ");

    const [event] = await orderHistory(orderId);
    expect(event.toStatus).toBe("cancelled");
    expect(event.note).toBe("Branch declined");
  });

  it("writes no event when a transition is rejected as invalid", async () => {
    const orderId = await pendingOrder();

    // pending -> fulfilled is not an edge. It must leave no trace at all.
    await expect(markOrderFulfilled(orderId, "admin-1")).resolves.toEqual({
      ok: false,
      reason: "invalid-transition",
    });
    await expect(orderHistory(orderId)).resolves.toEqual([]);
  });

  it("writes no event for an order that does not exist", async () => {
    await expect(confirmOrder("no-such-order", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(
      getPrisma().orderEvent.count({ where: { orderId: "no-such-order" } })
    ).resolves.toBe(0);
  });

  // The property the whole in-transaction design exists for: the loser of a
  // race must not leave a history entry claiming it won. A naive
  // "update, then log" implementation writes two events here.
  it("records exactly ONE event when two admin tabs race the same transition", async () => {
    const orderId = await pendingOrder();

    await Promise.all([
      confirmOrder(orderId, "admin-1"),
      confirmOrder(orderId, "admin-2"),
    ]);

    const events = await orderHistory(orderId);
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe("confirmed");

    // And the event agrees with the row that actually landed.
    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(events[0].actorUid).toBe(row.decidedBy);
  });

  it("keeps each order's history to itself", async () => {
    const a = await pendingOrder();
    const b = await pendingOrder();
    await confirmOrder(a, "admin-1");

    await expect(orderHistory(b)).resolves.toEqual([]);
    await expect(orderHistory(a)).resolves.toHaveLength(1);
  });

  it("the history always agrees with the order's current status", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await cancelOrder(orderId, "admin-2", "Customer withdrew");

    const events = await orderHistory(orderId);
    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(events[events.length - 1].toStatus).toBe(row.status);
  });
});

/** Records the customer's money as held for this order, the way `capturePayment` leaves it. */
let paymentSeq = 0;
async function markPaid(orderId: string) {
  paymentSeq += 1;
  await getPrisma().orderPayment.create({
    data: { orderId, providerRef: `TESTPAID${paymentSeq}`, provider: "clickpesa", amountTZS: 68_000_000, status: "captured", capturedAt: new Date() },
  });
}

describe("markOrderFulfilledByPartner — the one transition a partner may make", () => {
  it("marks a confirmed, paid order fulfilled when the branch scope matches", async () => {
    const orderId = await pendingOrder(); // toyota-dar branch
    await confirmOrder(orderId, "admin-1");
    await markPaid(orderId);

    const outcome = await markOrderFulfilledByPartner(
      orderId,
      { branchId: "toyota-dar", agentId: null },
      "uid-partner-fulfil",
    );
    expect(outcome).toEqual({ ok: true });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("fulfilled");
    expect(row.decidedBy).toBe("uid-partner-fulfil");
  });

  it("refuses a different branch's scope — the IDOR case", async () => {
    const orderId = await pendingOrder(); // toyota-dar branch
    await confirmOrder(orderId, "admin-1");

    const outcome = await markOrderFulfilledByPartner(
      orderId,
      { branchId: "toyota-arusha", agentId: null },
      "uid-not-this-branch",
    );
    expect(outcome).toEqual({ ok: false, reason: "not-found" });

    // Refused before the transition ever ran — status is untouched.
    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("confirmed");
    expect(row.decidedBy).toBe("admin-1");
  });

  // The promise on the site is that the shop is paid after delivery, which is
  // only true if nothing is delivered before it is paid for. Until 4 Oct 2026
  // the partner page offered "Mark delivered" on exactly this order.
  it("refuses a confirmed order the customer has not paid for, and leaves it confirmed", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");

    const outcome = await markOrderFulfilledByPartner(
      orderId,
      { branchId: "toyota-dar", agentId: null },
      "uid-partner-fulfil",
    );
    expect(outcome).toEqual({ ok: false, reason: "not-paid" });

    const row = await getPrisma().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.status).toBe("confirmed");
    expect(row.decidedBy).toBe("admin-1");
  });

  it("does not count a payment that was only attempted", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await getPrisma().orderPayment.create({
      data: { orderId, providerRef: "TESTOPEN1", provider: "clickpesa", amountTZS: 68_000_000, status: "pending", checkoutLink: "https://checkout.clickpesa.com/X" },
    });

    await expect(
      markOrderFulfilledByPartner(orderId, { branchId: "toyota-dar", agentId: null }, "uid-partner-fulfil"),
    ).resolves.toEqual({ ok: false, reason: "not-paid" });
  });

  it("still lets an admin mark an unpaid order fulfilled, for one settled outside MalFleks", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await expect(markOrderFulfilled(orderId, "admin-1")).resolves.toEqual({ ok: true });
  });

  it("refuses a still-pending order — nobody has paid for it or confirmed it", async () => {
    const orderId = await pendingOrder();

    const outcome = await markOrderFulfilledByPartner(
      orderId,
      { branchId: "toyota-dar", agentId: null },
      "uid-partner-fulfil",
    );
    expect(outcome).toEqual({ ok: false, reason: "not-paid" });
  });

  it("cannot mark the same order delivered twice", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await markPaid(orderId);
    const scope = { branchId: "toyota-dar", agentId: null };

    await expect(markOrderFulfilledByPartner(orderId, scope, "uid-partner-fulfil")).resolves.toEqual({ ok: true });
    await expect(markOrderFulfilledByPartner(orderId, scope, "uid-partner-fulfil")).resolves.toEqual({ ok: false, reason: "invalid-transition" });
  });

  it("refuses a scope with neither branchId nor agentId", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");

    const outcome = await markOrderFulfilledByPartner(
      orderId,
      { branchId: null, agentId: null },
      "uid-no-scope",
    );
    expect(outcome).toEqual({ ok: false, reason: "not-found" });
  });

  it("appends an OrderEvent stamped with the partner's own uid, not an admin's", async () => {
    const orderId = await pendingOrder();
    await confirmOrder(orderId, "admin-1");
    await markPaid(orderId);
    await markOrderFulfilledByPartner(
      orderId,
      { branchId: "toyota-dar", agentId: null },
      "uid-partner-fulfil",
    );

    const events = await orderHistory(orderId);
    const last = events[events.length - 1];
    expect(last.toStatus).toBe("fulfilled");
    expect(last.actorUid).toBe("uid-partner-fulfil");
  });
});
