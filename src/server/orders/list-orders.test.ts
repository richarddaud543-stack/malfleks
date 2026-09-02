// @vitest-environment node
//
// A real SQLite database built from the committed migration, same pattern as
// `create-order.test.ts` and `repositories.test.ts`. Orders are written with
// the real `createOrder` path rather than inserted by hand, so these tests
// prove the query layer against rows shaped exactly like production ones.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { seedDatabase } from "@/server/db/seed";
import { createOrder } from "./create-order";
import { listOrders } from "./list-orders";
import type { SaveOrderRequestInput } from "./build-order-request";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("list_orders");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

// Same fixtures the other two orders test files use — real catalogue
// records, not stand-ins.
const BRAND_DELIVERED = "toyota-corolla"; // Toyota Dar branch, own fleet
const AGENT_ROUTED = "toyota-hilux"; // Toyota Arusha branch, courier-served
const AGENT_IN_ARUSHA = "fargo-courier";

function input(overrides: Partial<SaveOrderRequestInput> = {}): SaveOrderRequestInput {
  return {
    productId: BRAND_DELIVERED,
    quantity: "1",
    fullName: "List Orders Fixture",
    phone: "0754123456",
    address: "Mikocheni B, near the Shell station",
    agentId: null,
    reference: "",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("listOrders — ordering and shape", () => {
  it("returns newest-first by createdAt", async () => {
    const first = await createOrder(input({ fullName: "Older Order" }), null);
    const second = await createOrder(input({ fullName: "Newer Order" }), null);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const orders = await listOrders({}, 200);
    const firstIndex = orders.findIndex((o) => o.id === first.value.id);
    const secondIndex = orders.findIndex((o) => o.id === second.value.id);

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(-1);
    // Newer order appears earlier in a newest-first list.
    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it("serialises every field the admin page renders", async () => {
    const outcome = await createOrder(
      input({ fullName: "Shape Check", quantity: "2" }),
      "uid-shape"
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const orders = await listOrders({}, 500);
    const order = orders.find((o) => o.id === outcome.value.id);
    expect(order).toBeDefined();
    if (!order) return;

    expect(order.status).toBe("pending");
    expect(order.reference).toMatch(/^TOY-DAR-[A-Z0-9]{4}$/);
    expect(order.customerId).toBe("uid-shape");
    expect(order.customerFullName).toBe("Shape Check");
    expect(order.customerPhone).toBe("+255754123456");
    expect(order.productName).toBe("Toyota Corolla");
    expect(order.quantity).toBe(2);
    expect(order.lineTotalTZS).toBe(order.unitPriceTZS * 2);
    expect(order.brandName).toBe("Toyota");
    expect(order.branchId).toBe("toyota-dar");
    expect(order.branchCity).toBe("Dar es Salaam");
    expect(order.routeKind).toBe("brand");
    // ISO strings, not Date objects — the page renders these directly.
    expect(typeof order.requestedAt).toBe("string");
    expect(typeof order.createdAt).toBe("string");
    expect(new Date(order.requestedAt).toString()).not.toBe("Invalid Date");
  });
});

describe("listOrders — filtering", () => {
  it("filters by branchId", async () => {
    const brandOrder = await createOrder(
      input({ fullName: "Branch Filter — Dar" }),
      null
    );
    const agentOrder = await createOrder(
      input({
        productId: AGENT_ROUTED,
        agentId: AGENT_IN_ARUSHA,
        fullName: "Branch Filter — Arusha",
      }),
      null
    );
    expect(brandOrder.ok).toBe(true);
    expect(agentOrder.ok).toBe(true);
    if (!brandOrder.ok || !agentOrder.ok) return;

    const darOnly = await listOrders({ branchId: "toyota-dar" }, 500);
    expect(darOnly.some((o) => o.id === brandOrder.value.id)).toBe(true);
    expect(darOnly.some((o) => o.id === agentOrder.value.id)).toBe(false);
    expect(darOnly.every((o) => o.branchId === "toyota-dar")).toBe(true);
  });

  it("filters by agentId, which is what a courier's own job list is scoped to", async () => {
    // `/partner/orders` gives a courier partner exactly this filter, resolved
    // from their session. Without the WHERE clause a courier would see every
    // customer's name, phone number and home address on MalFleks.
    const routedToAgent = await createOrder(
      input({
        productId: AGENT_ROUTED,
        agentId: AGENT_IN_ARUSHA,
        fullName: "Agent Filter — routed",
      }),
      null,
    );
    const branchDelivered = await createOrder(
      input({ fullName: "Agent Filter — branch fleet" }),
      null,
    );
    expect(routedToAgent.ok).toBe(true);
    expect(branchDelivered.ok).toBe(true);
    if (!routedToAgent.ok || !branchDelivered.ok) return;

    const theirs = await listOrders({ agentId: AGENT_IN_ARUSHA }, 500);

    expect(theirs.some((o) => o.id === routedToAgent.value.id)).toBe(true);
    // An order the brand delivers itself is not a courier's business.
    expect(theirs.some((o) => o.id === branchDelivered.value.id)).toBe(false);
  });

  it("returns everything when no filter is given — which is why callers must pass one", async () => {
    // Not a feature request: this documents the sharp edge. `/partner/orders`
    // refuses to call listOrders at all when the partner has neither a branch
    // nor an agent, because `listOrders({})` is the whole table.
    const mine = await createOrder(input({ fullName: "Unfiltered" }), null);
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;

    const everything = await listOrders({}, 500);
    expect(everything.length).toBeGreaterThan(1);
    expect(
      new Set(everything.map((o) => o.branchId)).size,
    ).toBeGreaterThan(1);
  });

  it("filters by status", async () => {
    const outcome = await createOrder(input({ fullName: "Status Filter" }), null);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const pending = await listOrders({ status: "pending" }, 500);
    expect(pending.some((o) => o.id === outcome.value.id)).toBe(true);
    expect(pending.every((o) => o.status === "pending")).toBe(true);

    const noMatch = await listOrders({ status: "not-a-real-status" }, 500);
    expect(noMatch).toEqual([]);
  });

  it("combines branchId and status filters", async () => {
    const outcome = await createOrder(
      input({ fullName: "Combined Filter" }),
      null
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const match = await listOrders(
      { branchId: "toyota-dar", status: "pending" },
      500
    );
    expect(match.some((o) => o.id === outcome.value.id)).toBe(true);

    const noMatch = await listOrders(
      { branchId: "toyota-arusha", status: "pending" },
      500
    );
    expect(noMatch.some((o) => o.id === outcome.value.id)).toBe(false);
  });
});

describe("listOrders — limit", () => {
  it("never returns more rows than the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await createOrder(input({ fullName: `Limit Fixture ${i}` }), null);
    }

    const capped = await listOrders({}, 3);
    expect(capped.length).toBeLessThanOrEqual(3);
  });

  it("defaults to 50 when no limit is given", async () => {
    const orders = await listOrders({});
    expect(orders.length).toBeLessThanOrEqual(50);
  });
});
