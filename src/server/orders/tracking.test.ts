// @vitest-environment node
//
// Same pattern as `list-orders.test.ts`: a real SQLite database built from
// the committed migrations, orders written through the real `createOrder`
// path so these prove the tracking queries against rows shaped exactly like
// production ones — including the ownership boundary, which is the one
// thing here that must never be tested against a mock.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { seedDatabase } from "@/server/db/seed";
import { createOrder } from "./create-order";
import { confirmOrder } from "./status";
import {
  latestPingsForOrders,
  postDeliveryPing,
  trackedOrderForCustomer,
  trackedOrderForPartner,
} from "./tracking";
import type { SaveOrderRequestInput } from "./build-order-request";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("tracking");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

// Same fixtures `list-orders.test.ts` and `create-order.test.ts` use.
const BRAND_DELIVERED = "toyota-corolla"; // Toyota Dar branch, own fleet
const AGENT_ROUTED = "toyota-hilux"; // Toyota Arusha branch, courier-served
const AGENT_IN_ARUSHA = "fargo-courier";

function input(overrides: Partial<SaveOrderRequestInput> = {}): SaveOrderRequestInput {
  return {
    productId: BRAND_DELIVERED,
    quantity: "1",
    fullName: "Tracking Fixture",
    phone: "0754123456",
    address: "Mikocheni B, near the Shell station",
    agentId: null,
    reference: "",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** A confirmed order for one customer, on the branch-fleet route. */
async function confirmedBrandOrder(customerId: string, fullName: string) {
  const created = await createOrder(input({ fullName }), customerId);
  if (!created.ok) throw new Error("fixture order failed to persist");
  const outcome = await confirmOrder(created.value.id, "admin-fixture");
  if (!outcome.ok) throw new Error("fixture order failed to confirm");
  return created.value;
}

describe("postDeliveryPing", () => {
  it("refuses a pending order — nothing to report on yet", async () => {
    const created = await createOrder(
      input({ fullName: "Still Pending" }),
      "uid-pending",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const outcome = await postDeliveryPing(
      created.value.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.8, longitude: 39.28 },
    );
    expect(outcome).toEqual({ ok: false, reason: "not-trackable" });
  });

  it("accepts a ping once confirmed, scoped to the right branch", async () => {
    const order = await confirmedBrandOrder("uid-confirmed", "Confirmed Order");

    const outcome = await postDeliveryPing(
      order.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.8, longitude: 39.28, note: "Picked up" },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.ping.latitude).toBe(-6.8);
    expect(outcome.ping.note).toBe("Picked up");
  });

  it("refuses a branch that isn't this order's own — the IDOR case", async () => {
    const order = await confirmedBrandOrder("uid-idor", "Not Your Order");

    // A different branch's scope, exactly what another partner's own session
    // would resolve to. Must read as not-found, never leak that the order
    // exists or move it.
    const outcome = await postDeliveryPing(
      order.id,
      { branchId: "toyota-arusha", agentId: null },
      { latitude: -6.8, longitude: 39.28 },
    );
    expect(outcome).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses the courier route's own agent scope for a branch-fleet order", async () => {
    const order = await confirmedBrandOrder(
      "uid-wrong-route",
      "Wrong Route Scope",
    );

    const outcome = await postDeliveryPing(
      order.id,
      { branchId: null, agentId: AGENT_IN_ARUSHA },
      { latitude: -6.8, longitude: 39.28 },
    );
    expect(outcome).toEqual({ ok: false, reason: "not-found" });
  });

  it("accepts a ping from the courier on an agent-routed order", async () => {
    const created = await createOrder(
      input({
        productId: AGENT_ROUTED,
        agentId: AGENT_IN_ARUSHA,
        fullName: "Courier Route",
      }),
      "uid-courier-route",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const confirmed = await confirmOrder(created.value.id, "admin-fixture");
    expect(confirmed.ok).toBe(true);

    const outcome = await postDeliveryPing(
      created.value.id,
      { branchId: null, agentId: AGENT_IN_ARUSHA },
      { latitude: -3.37, longitude: 36.68, note: "On the way" },
    );
    expect(outcome.ok).toBe(true);
  });

  it("rejects an out-of-range coordinate rather than silently storing it", async () => {
    const order = await confirmedBrandOrder("uid-bad-coord", "Bad Coordinate");

    const outcome = await postDeliveryPing(
      order.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: 200, longitude: 39.28 },
    );
    expect(outcome).toEqual({ ok: false, reason: "invalid-location" });
  });

  it("refuses a scope with neither branchId nor agentId", async () => {
    const order = await confirmedBrandOrder("uid-no-scope", "No Scope");

    const outcome = await postDeliveryPing(
      order.id,
      { branchId: null, agentId: null },
      { latitude: -6.8, longitude: 39.28 },
    );
    expect(outcome).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("trackedOrderForCustomer", () => {
  it("returns the order and its pings for its own customer", async () => {
    const order = await confirmedBrandOrder("uid-owner", "Owner View");
    await postDeliveryPing(
      order.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.8, longitude: 39.28, note: "Picked up" },
    );

    const view = await trackedOrderForCustomer("uid-owner", order.reference);
    expect(view).not.toBeNull();
    expect(view?.status).toBe("confirmed");
    expect(view?.pings).toHaveLength(1);
    expect(view?.pings[0].note).toBe("Picked up");
  });

  it("returns null for another customer's reference — the IDOR case", async () => {
    const order = await confirmedBrandOrder(
      "uid-real-owner",
      "Someone Else's Order",
    );

    const view = await trackedOrderForCustomer(
      "uid-attacker",
      order.reference,
    );
    expect(view).toBeNull();
  });

  it("returns null for a reference that does not exist", async () => {
    const view = await trackedOrderForCustomer("uid-owner", "NOPE-0000");
    expect(view).toBeNull();
  });

  it("orders pings newest-first", async () => {
    const order = await confirmedBrandOrder("uid-order-newest", "Newest First");
    await postDeliveryPing(
      order.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.8, longitude: 39.28, note: "Picked up" },
    );
    await postDeliveryPing(
      order.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.79, longitude: 39.27, note: "On the way" },
    );

    const view = await trackedOrderForCustomer(
      "uid-order-newest",
      order.reference,
    );
    expect(view?.pings.map((p) => p.note)).toEqual(["On the way", "Picked up"]);
  });
});

describe("trackedOrderForPartner", () => {
  it("returns the order for the branch it belongs to", async () => {
    const order = await confirmedBrandOrder("uid-partner-view", "Partner View");

    const view = await trackedOrderForPartner(order.id, {
      branchId: "toyota-dar",
      agentId: null,
    });
    expect(view).not.toBeNull();
    expect(view?.reference).toBe(order.reference);
  });

  it("returns null for a different branch's order", async () => {
    const order = await confirmedBrandOrder(
      "uid-partner-other",
      "Not This Branch",
    );

    const view = await trackedOrderForPartner(order.id, {
      branchId: "toyota-arusha",
      agentId: null,
    });
    expect(view).toBeNull();
  });
});

describe("latestPingsForOrders", () => {
  it("keeps only the newest ping per order", async () => {
    const a = await confirmedBrandOrder("uid-latest-a", "Latest A");
    const b = await confirmedBrandOrder("uid-latest-b", "Latest B");

    await postDeliveryPing(
      a.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.8, longitude: 39.28, note: "First" },
    );
    await postDeliveryPing(
      a.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.81, longitude: 39.29, note: "Second" },
    );
    await postDeliveryPing(
      b.id,
      { branchId: "toyota-dar", agentId: null },
      { latitude: -6.82, longitude: 39.3, note: "Only one" },
    );

    const latest = await latestPingsForOrders([a.id, b.id]);
    expect(latest.get(a.id)?.note).toBe("Second");
    expect(latest.get(b.id)?.note).toBe("Only one");
  });

  it("returns an empty map for an empty input, without querying", async () => {
    const latest = await latestPingsForOrders([]);
    expect(latest.size).toBe(0);
  });
});
