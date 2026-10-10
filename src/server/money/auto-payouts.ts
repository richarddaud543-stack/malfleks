import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import {
  createMobilePayout,
  getAccountBalance,
  previewMobilePayout,
  queryPayoutStatus,
  type ClickPesaPayoutRecord,
} from "@/server/payments/clickpesa";
import { MIN_MOBILE_PAYOUT_TZS } from "./payout-rules";
import { createPayoutBatch, listOwed, moneyTotals, type PayeeOwed } from "./payouts";

/**
 * Paying partners without anyone pressing a button.
 *
 * ## What the owner asked for (5 Oct 2026)
 *
 * "Once the delivery is confirmed, the admin system automatically releases
 * the money without me touching it." Delivery is confirmed by the customer's
 * code (`src/server/orders/delivery-code.ts`); that splits the money in the
 * ledger. This module is the last step: it asks ClickPesa to send each
 * partner their share, and records what ClickPesa says.
 *
 * ## The one rule everything here is built around
 *
 * A mobile-money payout cannot be pulled back. So the failure this module
 * must never have is **paying the same money twice**, and it would rather
 * leave a payout for a person to look at than risk it.
 *
 * How that is held:
 *
 * 1. A payout is drawn up (`createPayoutBatch`) exactly as an admin would --
 *    the ledger entries are claimed by a guarded write, so two runs at once
 *    cannot both draw up the same money.
 * 2. Before anything is sent the batch moves `pending -> sending` with a
 *    guarded write that also stores `sendRef`, the reference ClickPesa will
 *    know the payout by. Only the run that wins that write sends.
 * 3. ClickPesa itself refuses a repeated reference (409), and `sendRef` is
 *    unique here too.
 * 4. A batch in `sending` is **never sent again by this code**. It leaves that
 *    state only when ClickPesa says what happened (success, or the money came
 *    back), or when an admin decides from the Payouts page.
 *
 * Step 4 is what covers the nasty case: the request is sent, the connection
 * drops, and nobody knows whether ClickPesa got it. The batch stays `sending`
 * and the next run asks ClickPesa by reference instead of guessing.
 *
 * ## When it does nothing
 *
 * It is off unless `AUTO_PAYOUTS=on` is set on the deployment, and an admin
 * can pause it from the Payouts page without a deploy. When it is off or
 * paused, payouts are sent by hand exactly as before. It also leaves a payout
 * for a person when: the partner has no mobile number on file, the amount is
 * under ClickPesa's 2,500 TSh minimum, it is over the per-payout or daily
 * ceiling, or ClickPesa's balance cannot cover it.
 *
 * ## Pace
 *
 * ClickPesa accepts one payout request per merchant every 60 seconds, so each
 * run sends at most one. A run happens right after a delivery is confirmed,
 * on the daily job, and when an admin presses "Run now".
 */

export const AUTO_PAYOUT_ACTOR = "system:auto-payout";
const PAUSE_KEY = "autoPayoutsPaused";

type Env = Record<string, string | undefined>;

function ceiling(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export interface AutoPayoutConfig {
  /** `AUTO_PAYOUTS=on`. Anything else, including unset, is off. */
  armed: boolean;
  /** The most one automatic payout may be. Above it, a person sends it. */
  maxPerPayoutTZS: number;
  /** The most that may be sent automatically in one day (East Africa Time). */
  maxPerDayTZS: number;
}

export function autoPayoutConfig(env: Env = process.env): AutoPayoutConfig {
  return {
    armed: env.AUTO_PAYOUTS?.trim().toLowerCase() === "on",
    maxPerPayoutTZS: ceiling(env.AUTO_PAYOUT_MAX_TZS, 500_000),
    maxPerDayTZS: ceiling(env.AUTO_PAYOUT_DAILY_MAX_TZS, 2_000_000),
  };
}

export async function autoPayoutsPaused(): Promise<boolean> {
  const row = await getPrisma().appSetting.findUnique({ where: { key: PAUSE_KEY }, select: { value: true } });
  return row?.value === "true";
}

/** The admin's off switch. Pausing can only make the site do less than the environment allows. */
export async function setAutoPayoutsPaused(paused: boolean, adminUid: string): Promise<void> {
  const value = paused ? "true" : "false";
  await getPrisma().appSetting.upsert({
    where: { key: PAUSE_KEY },
    create: { key: PAUSE_KEY, value, updatedBy: adminUid },
    update: { value, updatedBy: adminUid },
  });
}

export interface AutoPayoutStatus extends AutoPayoutConfig {
  paused: boolean;
  /** Armed and not paused: a confirmed delivery is paid without anyone pressing anything. */
  active: boolean;
  sentTodayTZS: number;
}

/** Midnight at the start of today in East Africa Time (UTC+3, no daylight saving). */
export function eatDayStart(now: Date): Date {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - 3 * 3_600_000);
}

/**
 * Everything MalFleks has sent out by itself today: payouts to partners and
 * refunds to customers (`refund-send.ts`). One total, because the daily
 * ceiling is a limit on money leaving without a person looking, and it does
 * not matter to that limit who the money went to.
 */
export async function sentTodayTZS(now: Date): Promise<number> {
  const since = eatDayStart(now);
  const db = getPrisma();
  const [payouts, refunds] = await Promise.all([
    db.payoutBatch.aggregate({
      where: { sendRef: { not: null }, sendStartedAt: { gte: since }, status: { in: ["sending", "paid"] } },
      _sum: { totalTZS: true },
    }),
    db.refundSend.aggregate({
      where: { sendStartedAt: { gte: since }, status: { in: ["sending", "sent"] } },
      _sum: { amountTZS: true },
    }),
  ]);
  return (payouts._sum.totalTZS ?? 0) + (refunds._sum.amountTZS ?? 0);
}

/** ClickPesa accepts one payout request per merchant every 60 seconds; a little over, for the clocks. */
export const SEND_SPACING_MS = 70_000;

/**
 * Whether MalFleks asked ClickPesa to send money so recently that another
 * request now would be refused for pace alone. A refund and a partner payout
 * share the one-a-minute allowance, and a payout refused for pace would be
 * marked failed and wait a day for no reason.
 */
export async function sentJustNow(now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - SEND_SPACING_MS);
  const db = getPrisma();
  const [payout, refund] = await Promise.all([
    db.payoutBatch.findFirst({ where: { sendStartedAt: { gte: since } }, select: { id: true } }),
    db.refundSend.findFirst({ where: { sendStartedAt: { gte: since } }, select: { id: true } }),
  ]);
  return Boolean(payout || refund);
}

export async function autoPayoutStatus(now: Date = new Date(), env: Env = process.env): Promise<AutoPayoutStatus> {
  const config = autoPayoutConfig(env);
  const [paused, sent] = await Promise.all([autoPayoutsPaused(), sentTodayTZS(now)]);
  return { ...config, paused, active: config.armed && !paused, sentTodayTZS: sent };
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

export type SkipReason = "no-mobile-number" | "below-minimum" | "above-ceiling" | "daily-ceiling" | "already-open" | "recently-failed";

/** After an automatic payout to someone fails or comes back, how long before another is tried. */
export const RETRY_AFTER_HOURS = 24;

/**
 * Whether one payee's balance may be sent automatically right now -- pure, so
 * every rule is testable without a database or ClickPesa.
 */
export function autoPayoutDecision(
  payee: Pick<PayeeOwed, "totalTZS" | "payoutPhone">,
  config: Pick<AutoPayoutConfig, "maxPerPayoutTZS" | "maxPerDayTZS">,
  sentToday: number,
  hasOpenBatch: boolean,
  recentlyFailed = false,
): { send: true } | { send: false; reason: SkipReason } {
  // One payout in flight per payee: a second drawn up beside a first that is
  // still unanswered is how two payments for the same week's work get sent.
  if (hasOpenBatch) return { send: false, reason: "already-open" };
  // A payout that just bounced usually bounced for a reason that has not
  // changed (a wrong number, a full wallet). Trying again every time an order
  // is delivered would spend API calls and fees on the same failure, so the
  // payee waits a day or for a person.
  if (recentlyFailed) return { send: false, reason: "recently-failed" };
  if (!payee.payoutPhone) return { send: false, reason: "no-mobile-number" };
  if (payee.totalTZS < MIN_MOBILE_PAYOUT_TZS) return { send: false, reason: "below-minimum" };
  if (payee.totalTZS > config.maxPerPayoutTZS) return { send: false, reason: "above-ceiling" };
  if (sentToday + payee.totalTZS > config.maxPerDayTZS) return { send: false, reason: "daily-ceiling" };
  return { send: true };
}

/** `P` + the batch id, upper-cased: alphanumeric, unique, and traceable back to the batch by eye. */
export function sendRefFor(batchId: string): string {
  return `P${batchId.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Recording what ClickPesa said
// ---------------------------------------------------------------------------

const DONE = new Set(["SUCCESS"]);
const RETURNED = new Set(["REFUNDED", "REVERSED", "FAILED"]);

export type SettleOutcome = "paid" | "returned" | "still-sending" | "not-ours";

/**
 * Apply ClickPesa's word on a payout to the batch it belongs to. Used by the
 * send itself, by the status check and by the webhook, so all three roads
 * apply the same rules.
 *
 * - SUCCESS: `sending -> paid`, with ClickPesa's own id as the reference.
 * - REFUNDED / REVERSED / FAILED: the money did not arrive (or came back). The
 *   batch is marked failed and its entries go back to "owed" -- from `sending`,
 *   and also from `paid`, because a network can reverse a payout minutes after
 *   reporting success.
 * - Anything else: still on its way. Nothing changes.
 */
export async function settlePayoutFromProvider(sendRef: string, record: ClickPesaPayoutRecord): Promise<{ outcome: SettleOutcome; batchId: string | null }> {
  const db = getPrisma();
  const batch = await db.payoutBatch.findUnique({ where: { sendRef }, select: { id: true } });
  if (!batch) return { outcome: "not-ours", batchId: null };

  if (DONE.has(record.status)) {
    const { count } = await db.payoutBatch.updateMany({
      where: { id: batch.id, status: "sending" },
      data: {
        status: "paid",
        // ClickPesa's id when it gave one; our own reference otherwise. Either finds the payout on its dashboard.
        providerRef: record.id ?? sendRef,
        paidAt: new Date(),
        paidBy: AUTO_PAYOUT_ACTOR,
        ...(record.feeTZS != null ? { feeTZS: Math.round(record.feeTZS) } : {}),
      },
    });
    return { outcome: count === 1 ? "paid" : "still-sending", batchId: batch.id };
  }

  if (RETURNED.has(record.status)) {
    const released = await db.$transaction(async (tx) => {
      const { count } = await tx.payoutBatch.updateMany({
        where: { id: batch.id, status: { in: ["sending", "paid"] } },
        data: {
          status: "failed",
          failedAt: new Date(),
          failureNote: `ClickPesa reported ${record.status}: the money did not reach the partner (reference ${sendRef})`,
          // Free the reference column so the money can be recorded again when it is re-sent.
          providerRef: null,
          paidAt: null,
        },
      });
      if (count === 0) return false;
      await tx.ledgerEntry.updateMany({ where: { payoutBatchId: batch.id }, data: { payoutBatchId: null } });
      return true;
    });
    return { outcome: released ? "returned" : "still-sending", batchId: batch.id };
  }

  return { outcome: "still-sending", batchId: batch.id };
}

/** A payout that was drawn up but never left: mark it failed and put its entries back to "owed". */
async function releaseUnsent(batchId: string, why: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const { count } = await tx.payoutBatch.updateMany({
      where: { id: batchId, status: { in: ["pending", "sending"] } },
      data: { status: "failed", failedAt: new Date(), failureNote: why.slice(0, 500) },
    });
    if (count === 1) await tx.ledgerEntry.updateMany({ where: { payoutBatchId: batchId }, data: { payoutBatchId: null } });
  });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface AutoPayoutRun {
  /** Why nothing was attempted, when nothing was. */
  skipped?: "off" | "paused";
  /** Payouts in `sending` that got a final answer this run. */
  settled: { batchId: string; outcome: SettleOutcome }[];
  /** The one payout this run tried to send, if any. */
  sent?: { batchId: string; payee: string; amountTZS: number; result: "paid" | "sending" | "refused" | "unknown" | "insufficient-balance"; detail?: string };
  /** Payees left for a person, and why. */
  leftForAdmin: { payee: string; amountTZS: number; reason: SkipReason }[];
}

/**
 * Ask ClickPesa about every payout still in `sending`. Safe to run any number
 * of times. A payout ClickPesa has no record of is left alone -- "not found"
 * is not proof that it never arrived, and only a person may decide that.
 */
export async function settleSendingPayouts(limit = 5): Promise<AutoPayoutRun["settled"]> {
  const sending = await getPrisma().payoutBatch.findMany({
    where: { status: "sending", sendRef: { not: null } },
    orderBy: { sendStartedAt: "asc" },
    take: limit,
    select: { id: true, sendRef: true },
  });
  const settled: AutoPayoutRun["settled"] = [];
  for (const batch of sending) {
    const status = await queryPayoutStatus(batch.sendRef!);
    if (!status.ok) {
      await logServerError("auto-payout-status", new Error(`${batch.sendRef}: ${status.reason} ${status.detail ?? ""}`));
      continue;
    }
    if (!status.found) continue;
    const { outcome } = await settlePayoutFromProvider(batch.sendRef!, status.record);
    if (outcome === "paid" || outcome === "returned") {
      settled.push({ batchId: batch.id, outcome });
      await tellPeople(batch.id, outcome);
    }
  }
  return settled;
}

/** After a final answer: the partner is told they were paid; MalFleks is told when money came back. */
async function tellPeople(batchId: string, outcome: SettleOutcome): Promise<void> {
  const { notifyPayoutSent, notifyAutoPayoutNeedsAttention } = await import("@/server/notify/events");
  if (outcome === "paid") await notifyPayoutSent(batchId);
  if (outcome === "returned") await notifyAutoPayoutNeedsAttention(batchId);
}

/**
 * One pass: settle what is in flight, then send at most one new payout.
 * Never throws -- every failure is logged and reported in the result, because
 * this runs after a customer's delivery was confirmed and must not undo it.
 */
export async function runAutoPayouts(now: Date = new Date(), env: Env = process.env, options: { settleInFlight?: boolean } = {}): Promise<AutoPayoutRun> {
  const run: AutoPayoutRun = { settled: [], leftForAdmin: [] };
  try {
    const config = autoPayoutConfig(env);
    // In-flight payouts are settled even when sending is off or paused: the
    // money already left, and the books should say what happened to it.
    // (`settleInFlight: false` is the rulebook, which has just done exactly
    // that in a step of its own and has no ClickPesa calls to spend twice.)
    if (options.settleInFlight !== false) run.settled = await settleSendingPayouts();

    if (!config.armed) return { ...run, skipped: "off" };
    if (await autoPayoutsPaused()) return { ...run, skipped: "paused" };

    const db = getPrisma();
    const [owed, open, failed, sentToday] = await Promise.all([
      listOwed(db),
      db.payoutBatch.findMany({ where: { status: { in: ["pending", "sending"] } }, select: { payeeType: true, payeeId: true } }),
      db.payoutBatch.findMany({
        where: { status: "failed", createdBy: AUTO_PAYOUT_ACTOR, failedAt: { gte: new Date(now.getTime() - RETRY_AFTER_HOURS * 3_600_000) } },
        select: { payeeType: true, payeeId: true },
      }),
      sentTodayTZS(now),
    ]);
    const openKeys = new Set(open.map((b) => `${b.payeeType}:${b.payeeId}`));
    const failedKeys = new Set(failed.map((b) => `${b.payeeType}:${b.payeeId}`));

    let chosen: PayeeOwed | null = null;
    for (const payee of owed.payees) {
      const key = `${payee.payeeType}:${payee.payeeId}`;
      const decision = autoPayoutDecision(payee, config, sentToday, openKeys.has(key), failedKeys.has(key));
      if (decision.send) {
        chosen ??= payee;
      } else if (decision.reason !== "already-open") {
        run.leftForAdmin.push({ payee: payee.name, amountTZS: payee.totalTZS, reason: decision.reason });
      }
    }
    if (!chosen) return run;
    // Something was sent in the last minute (a refund, or another run's
    // payout). The next run sends this one.
    if (await sentJustNow(now)) return run;

    run.sent = await sendOne(chosen, now);
    return run;
  } catch (error) {
    await logServerError("auto-payout-run", error);
    return run;
  }
}

async function sendOne(payee: PayeeOwed, now: Date): Promise<NonNullable<AutoPayoutRun["sent"]>> {
  const db = getPrisma();
  const phoneNumber = payee.payoutPhone!;

  // 1. Draw it up, exactly as an admin would.
  const drawn = await createPayoutBatch({ payeeType: payee.payeeType, payeeId: payee.payeeId }, AUTO_PAYOUT_ACTOR);
  if (!drawn.ok) return { batchId: "", payee: payee.name, amountTZS: payee.totalTZS, result: "refused", detail: drawn.reason };
  const { batchId, totalTZS } = drawn;
  const sendRef = sendRefFor(batchId);
  const base = { batchId, payee: payee.name, amountTZS: totalTZS };

  // 2. Would ClickPesa send it? This sends nothing, so a "no" here is safe to
  //    act on: the payout is cancelled and the money is owed again.
  const preview = await previewMobilePayout({ amountTZS: totalTZS, phoneNumber, orderReference: sendRef });
  if (!preview.ok) {
    const detail = preview.reason === "refused" ? `ClickPesa would not send it (${preview.status}): ${preview.detail}` : `Could not ask ClickPesa (${preview.reason}): ${preview.detail ?? ""}`;
    await releaseUnsent(batchId, `Automatic payout not sent. ${detail}`);
    await logServerError("auto-payout-preview", new Error(`${sendRef}: ${detail}`));
    return { ...base, result: /insufficient balance/i.test(detail) ? "insufficient-balance" : "refused", detail };
  }
  if (preview.balanceTZS != null && preview.balanceTZS < preview.totalTZS) {
    const detail = `ClickPesa holds TSh ${preview.balanceTZS}, and this payout needs TSh ${preview.totalTZS} with its fee`;
    await releaseUnsent(batchId, `Automatic payout not sent. ${detail}`);
    await logServerError("auto-payout-balance", new Error(`${sendRef}: ${detail}`));
    return { ...base, result: "insufficient-balance", detail };
  }

  // 3. Claim the right to send. Only the run that wins this write goes on, and
  //    the reference is on record before the request leaves.
  const claimed = await db.payoutBatch.updateMany({
    where: { id: batchId, status: "pending", sendRef: null },
    // The run's own clock: the daily ceiling and the one-a-minute pace are both measured against it.
    data: { status: "sending", sendRef, sendStartedAt: now, feeTZS: Math.round(preview.feeTZS) },
  });
  if (claimed.count !== 1) return { ...base, result: "refused", detail: "someone else acted on this payout first" };

  // 4. Send.
  const created = await createMobilePayout({ amountTZS: totalTZS, phoneNumber, orderReference: sendRef });

  if (created.ok) {
    const { outcome } = await settlePayoutFromProvider(sendRef, created.record);
    if (outcome === "paid" || outcome === "returned") await tellPeople(batchId, outcome);
    return { ...base, result: outcome === "paid" ? "paid" : outcome === "returned" ? "refused" : "sending" };
  }

  if (created.reason === "refused" || created.reason === "auth-failed") {
    // A definite no: the request was rejected, or never sent for want of a
    // token. Nothing left ClickPesa, so the money is owed again.
    const detail = created.reason === "refused" ? `ClickPesa refused it (${created.status}): ${created.detail}` : `No ClickPesa token: ${created.detail ?? ""}`;
    await releaseUnsent(batchId, `Automatic payout not sent. ${detail}`);
    await logServerError("auto-payout-create", new Error(`${sendRef}: ${detail}`));
    return { ...base, result: "refused", detail };
  }

  // "duplicate-reference" or "unknown": ClickPesa may hold this payout. It
  // stays `sending`; the next run asks by reference. It is never sent again.
  await logServerError("auto-payout-create", new Error(`${sendRef}: outcome not known (${created.reason}${"detail" in created && created.detail ? `: ${created.detail}` : ""}) -- left as sending`));
  return { ...base, result: "unknown", detail: created.reason };
}

// ---------------------------------------------------------------------------
// The books against the real balance
// ---------------------------------------------------------------------------

export type BalanceCheck =
  | { ok: true; clickpesaTZS: number; booksTZS: number; differenceTZS: number }
  | { ok: false; reason: string };

/**
 * What ClickPesa really holds, beside what the ledger says it should hold
 * (collected, less refunds, less payouts sent). They will differ by ClickPesa's
 * own fees and by anything moved by hand outside MalFleks -- the point is to
 * see the difference, not to assume there is none.
 */
export async function compareBooksWithClickPesa(): Promise<BalanceCheck> {
  const [balance, totals] = await Promise.all([getAccountBalance(), moneyTotals()]);
  if (!balance.ok) return { ok: false, reason: balance.detail ?? balance.reason };
  return {
    ok: true,
    clickpesaTZS: balance.balanceTZS,
    booksTZS: totals.heldTZS,
    differenceTZS: Math.round(balance.balanceTZS - totals.heldTZS),
  };
}
