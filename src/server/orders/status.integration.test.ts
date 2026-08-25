// @vitest-environment node
//
// Runs against a real SQLite database built from the committed migrations,
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

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma, resetPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createOrder } from "./create-order";
import { cancelOrder, confirmOrder, markOrderFulfilled } from "./status";
import type { SaveOrderRequestInput } from "./build-order-request";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const PRISMA_CLI = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");

let workDir: string;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "soko-order-status-test-"));
  const databaseUrl = `file:${path.join(workDir, "test.db").replaceAll("\\", "/")}`;

  process.env.DATABASE_URL = databaseUrl;
  await resetPrisma();

  if (!existsSync(PRISMA_CLI)) {
    throw new Error(
      `Prisma CLI not found at ${PRISMA_CLI}. Run "npm install" before the test suite.`
    );
  }

  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await resetPrisma();
  rmSync(workDir, { recursive: true, force: true });
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
