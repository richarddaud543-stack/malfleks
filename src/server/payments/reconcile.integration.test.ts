// Real Postgres, mocked ClickPesa. What is under test is everything between
// "ClickPesa said X" and "the database now says Y" -- including that a
// reconciliation capture and a webhook capture of the same payment still add
// up to exactly one ledger entry.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryPaymentStatus = vi.fn();
vi.mock("./clickpesa", () => ({ queryPaymentStatus: (ref: string) => queryPaymentStatus(ref) }));

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createOrder } from "@/server/orders/create-order";
import { reconcileDue, reconcilePayment } from "./reconcile";
import { capturePayment } from "./settle";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("reconcile");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(async () => {
  queryPaymentStatus.mockReset();
  // Each test owns the set of open payments, so reconcileDue's selection is exact.
  await getPrisma().ledgerEntry.deleteMany();
  await getPrisma().orderPayment.deleteMany();
});

let sequence = 0;

async function pendingPayment(overrides: { amountTZS?: number; lastCheckedAt?: Date } = {}) {
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
  return getPrisma().orderPayment.create({
    data: {
      orderId: outcome.value.id,
      providerRef: `RECON${sequence}X${Date.now()}`,
      provider: "clickpesa",
      amountTZS: overrides.amountTZS ?? 5574,
      lastCheckedAt: overrides.lastCheckedAt ?? null,
    },
  });
}

const success = (amount: number, ref = "CP-R") => ({
  ok: true,
  found: true,
  records: [
    {
      status: "SUCCESS",
      paymentReference: ref,
      orderReference: "ignored",
      collectedAmount: amount,
      message: "ok",
      updatedAt: "2026-10-01T10:00:00Z",
    },
  ],
});

describe("reconcilePayment", () => {
  it("captures when ClickPesa reports the money collected", async () => {
    const p = await pendingPayment();
    queryPaymentStatus.mockResolvedValueOnce(success(5574, "CP-R1"));

    await expect(reconcilePayment(p.id)).resolves.toMatchObject({
      outcome: "captured",
      providerStatus: "SUCCESS",
    });

    const row = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("captured");
    expect(row.lastCheckedAt).not.toBeNull();
    expect(row.providerStatus).toBe("SUCCESS");
    const ledger = await getPrisma().ledgerEntry.findMany({ where: { paymentId: p.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].note).toBe("ClickPesa CP-R1 · reconciled");
  });

  it("leaves an unpaid link pending when ClickPesa has no attempt yet", async () => {
    const p = await pendingPayment();
    queryPaymentStatus.mockResolvedValueOnce({ ok: true, found: false });

    await expect(reconcilePayment(p.id)).resolves.toMatchObject({
      outcome: "waiting",
      providerStatus: "NO_ATTEMPTS",
    });
    const row = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("pending");
  });

  it("never marks a payment failed, even when every attempt failed", async () => {
    const p = await pendingPayment();
    queryPaymentStatus.mockResolvedValueOnce({
      ok: true,
      found: true,
      records: [
        {
          status: "FAILED",
          paymentReference: null,
          orderReference: null,
          collectedAmount: null,
          message: "declined",
          updatedAt: null,
        },
      ],
    });

    await expect(reconcilePayment(p.id)).resolves.toMatchObject({
      outcome: "waiting",
      providerStatus: "FAILED",
    });
    // Still open: a retry on the same link must still be able to land.
    const row = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("pending");
    expect(row.failedAt).toBeNull();
  });

  it("records a failed check without changing the payment, and logs it", async () => {
    const p = await pendingPayment();
    queryPaymentStatus.mockResolvedValueOnce({
      ok: false,
      reason: "auth-failed",
      detail: "generate-token failed: HTTP 401",
    });

    await expect(reconcilePayment(p.id)).resolves.toMatchObject({
      outcome: "check-failed",
      providerStatus: "CHECK_FAILED",
    });
    const row = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("pending");
    expect(row.lastCheckedAt).not.toBeNull();

    const logged = await getPrisma().serverErrorLog.findFirst({
      where: { context: "clickpesa-reconcile" },
      orderBy: { createdAt: "desc" },
    });
    expect(logged?.message).toContain(p.providerRef);
    expect(logged?.message).toContain("401");
  });

  it("refuses a success whose amount does not match, and leaves it pending", async () => {
    const p = await pendingPayment({ amountTZS: 5574 });
    queryPaymentStatus.mockResolvedValueOnce(success(1));

    await expect(reconcilePayment(p.id)).resolves.toMatchObject({ outcome: "amount-mismatch" });
    const row = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("pending");
    expect(await getPrisma().ledgerEntry.count({ where: { paymentId: p.id } })).toBe(0);
  });

  it("does not double-record when the webhook already captured it", async () => {
    const p = await pendingPayment();
    await capturePayment({
      providerRef: p.providerRef,
      paymentReference: "CP-W",
      collectedAmount: 5574,
      source: "webhook",
    });

    await expect(reconcilePayment(p.id)).resolves.toMatchObject({ outcome: "already-captured" });
    // ClickPesa was not even asked: the row already said captured.
    expect(queryPaymentStatus).not.toHaveBeenCalled();
    expect(await getPrisma().ledgerEntry.count({ where: { paymentId: p.id } })).toBe(1);
  });
});

describe("reconcileDue", () => {
  it("skips payments checked recently, and respects the limit", async () => {
    const fresh = await pendingPayment({ lastCheckedAt: new Date(Date.now() - 60_000) });
    const stale1 = await pendingPayment({ lastCheckedAt: new Date(Date.now() - 3 * 3_600_000) });
    const never = await pendingPayment();
    const stale2 = await pendingPayment({ lastCheckedAt: new Date(Date.now() - 2 * 3_600_000) });
    queryPaymentStatus.mockResolvedValue({ ok: true, found: false });

    const results = await reconcileDue({ staleAfterMinutes: 30, limit: 2 });

    // Never-checked first, then the longest-unchecked; the fresh one is not spent on.
    expect(results.map((r) => r.paymentId)).toEqual([never.id, stale1.id]);
    expect(queryPaymentStatus).toHaveBeenCalledTimes(2);
    const untouched = await getPrisma().orderPayment.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(untouched.providerStatus).toBeNull();
    void stale2;
  });

  it("keeps going when one payment's check throws", async () => {
    const a = await pendingPayment();
    const b = await pendingPayment();
    queryPaymentStatus
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(success(5574, "CP-OK"));

    const results = await reconcileDue({ staleAfterMinutes: 30, limit: 10 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ paymentId: b.id, outcome: "captured" });
    void a;
  });
});
