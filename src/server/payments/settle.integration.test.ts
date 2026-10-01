// Real Postgres. These are the rules that decide whether a customer's money is
// recorded, and two of them -- "exactly once" under a race, and "a failed
// attempt can still be captured" -- are claims about row-level locking that
// only the engine production runs on can actually prove.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createOrder } from "@/server/orders/create-order";
import { capturePayment, failPayment } from "./settle";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("settle");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let sequence = 0;

/** A real order with one pending payment attempt against it. */
async function pendingPayment(amountTZS = 5574) {
  const outcome = await createOrder(
    {
      productId: "toyota-corolla",
      quantity: "1",
      fullName: "Asha Mwenda",
      phone: "0754123456",
      address: "Mikocheni B",
      agentId: null,
      reference: "",
      requestedAt: new Date().toISOString(),
    },
    null,
  );
  if (!outcome.ok) throw new Error(`fixture setup failed: ${outcome.reason}`);

  sequence += 1;
  const providerRef = `SETTLE${sequence}X${Date.now()}`;
  const payment = await getPrisma().orderPayment.create({
    data: { orderId: outcome.value.id, providerRef, provider: "clickpesa", amountTZS },
  });
  return { orderId: outcome.value.id, paymentId: payment.id, providerRef, amountTZS };
}

const ledgerFor = (orderId: string) => getPrisma().ledgerEntry.findMany({ where: { orderId } });
const paymentRow = (id: string) => getPrisma().orderPayment.findUniqueOrThrow({ where: { id } });

describe("capturePayment", () => {
  it("captures a pending payment and writes exactly one ledger entry", async () => {
    const p = await pendingPayment();

    await expect(
      capturePayment({
        providerRef: p.providerRef,
        paymentReference: "CP-1",
        collectedAmount: p.amountTZS,
        source: "webhook",
      }),
    ).resolves.toBe("captured");

    const row = await paymentRow(p.paymentId);
    expect(row.status).toBe("captured");
    expect(row.capturedAt).not.toBeNull();
    expect(row.providerRef).toBe("CP-1");

    const ledger = await ledgerFor(p.orderId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: "collected", amountTZS: p.amountTZS, paymentId: p.paymentId });
    expect(ledger[0].note).toBe("ClickPesa CP-1");
  });

  it("marks the ledger note when reconciliation, not the webhook, recorded it", async () => {
    const p = await pendingPayment();
    await capturePayment({
      providerRef: p.providerRef,
      paymentReference: "CP-2",
      collectedAmount: p.amountTZS,
      source: "reconcile",
    });
    const [entry] = await ledgerFor(p.orderId);
    expect(entry.note).toBe("ClickPesa CP-2 · reconciled");
  });

  it("is a no-op the second time, by either reference", async () => {
    const p = await pendingPayment();
    const once = { paymentReference: "CP-3", collectedAmount: p.amountTZS, source: "webhook" as const };

    await capturePayment({ providerRef: p.providerRef, ...once });
    // The original reference was renamed on capture, so a late duplicate finds nothing...
    await expect(capturePayment({ providerRef: p.providerRef, ...once })).resolves.toBe("no-such-payment");
    // ...and one addressed to ClickPesa's own reference finds it already done.
    await expect(capturePayment({ providerRef: "CP-3", ...once })).resolves.toBe("already-captured");

    expect(await ledgerFor(p.orderId)).toHaveLength(1);
  });

  it("refuses an amount that does not match the snapshot, and records nothing", async () => {
    const p = await pendingPayment(5574);

    await expect(
      capturePayment({
        providerRef: p.providerRef,
        paymentReference: "CP-4",
        collectedAmount: 100,
        source: "reconcile",
      }),
    ).resolves.toBe("amount-mismatch");

    expect((await paymentRow(p.paymentId)).status).toBe("pending");
    expect(await ledgerFor(p.orderId)).toHaveLength(0);

    const logged = await getPrisma().serverErrorLog.findFirst({
      where: { context: "clickpesa-reconcile-amount-mismatch" },
      orderBy: { createdAt: "desc" },
    });
    expect(logged?.message).toContain(p.providerRef);
  });

  it("captures a payment that failed first -- the customer retried on the same link", async () => {
    // Before 1 Oct 2026 this returned without recording anything: capture
    // only accepted `pending`, a FAILED event had already moved the row to
    // `failed`, and the retry's money was collected with nothing written.
    const p = await pendingPayment();

    await failPayment(p.providerRef, "Insufficient balance");
    const failed = await paymentRow(p.paymentId);
    expect(failed.status).toBe("failed");

    await expect(
      capturePayment({
        providerRef: p.providerRef,
        paymentReference: "CP-5",
        collectedAmount: p.amountTZS,
        source: "webhook",
      }),
    ).resolves.toBe("captured");

    const row = await paymentRow(p.paymentId);
    expect(row.status).toBe("captured");
    // The first attempt's failure stays on the record as history.
    expect(row.failedAt).toEqual(failed.failedAt);
    expect(row.failureNote).toBe("Insufficient balance");
    expect(await ledgerFor(p.orderId)).toHaveLength(1);
  });

  it("captures exactly once when the webhook and reconciliation race", async () => {
    const p = await pendingPayment();
    const attempt = (source: "webhook" | "reconcile") =>
      capturePayment({
        providerRef: p.providerRef,
        paymentReference: "CP-6",
        collectedAmount: p.amountTZS,
        source,
      });

    const outcomes = await Promise.all([attempt("webhook"), attempt("reconcile")]);

    expect(outcomes.filter((o) => o === "captured")).toHaveLength(1);
    expect(await ledgerFor(p.orderId)).toHaveLength(1);
  });
});

describe("failPayment", () => {
  it("cannot undo a capture that arrived first", async () => {
    const p = await pendingPayment();
    await capturePayment({
      providerRef: p.providerRef,
      paymentReference: "CP-7",
      collectedAmount: p.amountTZS,
      source: "webhook",
    });

    // Out-of-order delivery: a FAILED for an attempt that has since succeeded.
    await failPayment("CP-7", "late failure event");

    const row = await paymentRow(p.paymentId);
    expect(row.status).toBe("captured");
    expect(row.failedAt).toBeNull();
  });
});
