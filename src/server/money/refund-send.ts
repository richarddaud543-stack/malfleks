import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { RULES_ACTOR } from "@/server/orders/status";
import { createMobilePayout, previewMobilePayout, queryPayoutStatus, type ClickPesaPayoutRecord } from "@/server/payments/clickpesa";
import { autoPayoutConfig, autoPayoutsPaused, sentJustNow, sentTodayTZS, type AutoPayoutConfig } from "./auto-payouts";
import { MIN_MOBILE_PAYOUT_TZS, SPLIT_KINDS, toPayoutPhone } from "./payout-rules";

/**
 * Giving a customer their money back without anyone pressing a button.
 *
 * ## What the owner asked for (10 Oct 2026)
 *
 * "Make it work when I am not around." A customer who paid for something the
 * shop then could not supply should not wait for the owner's next visit to get
 * their money back. So when a paid order is cancelled for a reason that is
 * **not the customer's choice**, MalFleks refunds it in full, by itself.
 *
 * ## Which cancellations
 *
 * Three, decided by `autoRefundReason` from who cancelled and when:
 *
 * - `shop-declined` -- the shop said it cannot supply the order.
 * - `deadline` -- the rulebook cancelled it because it was not delivered in time.
 * - `paid-after-cancel` -- the payment landed after the order was already
 *   cancelled (the customer paid on an old link). Nobody is going to deliver
 *   it, whoever cancelled it.
 *
 * Everything else waits for a person, exactly as before: an order an admin
 * cancelled (he had a reason, and may have agreed a part refund), and any
 * order whose money somebody has already touched by hand.
 *
 * ## How it is sent
 *
 * ClickPesa has no "refund" call. A refund is a mobile-money payout to the
 * wallet that paid, which is why `OrderPayment.payerPhone` is recorded at
 * capture. If that number is not known the refund is left for the owner --
 * the phone number typed on the order form is where the goods go, and is not
 * proof of whose wallet the money came from.
 *
 * ## The one rule, again
 *
 * A mobile-money payout cannot be pulled back, so this keeps the same
 * discipline as `auto-payouts.ts`, step for step:
 *
 * 1. A `RefundSend` row is created inside a transaction that locks the order
 *    and re-reads what is refundable. `openOrderId` is unique, so an order can
 *    have only one refund in flight.
 * 2. `pending -> sending` is a guarded write that stores `sendRef` before the
 *    request leaves. Only the run that wins it sends.
 * 3. A row in `sending` is **never sent again by this code**. It leaves that
 *    state when ClickPesa says what happened.
 * 4. The ledger's `refund` entry is written only when ClickPesa reports
 *    SUCCESS, in the same transaction that marks the row `sent`. Until then
 *    `refundableFor` subtracts the amount in flight, so nobody can record a
 *    second refund of the same money by hand.
 * 5. One automatic attempt per order. A refund ClickPesa refused, or that came
 *    back, is not retried: the reason (a wrong number, a closed wallet) has
 *    not changed, and the owner is told instead.
 *
 * ## When it does nothing
 *
 * It obeys the same switches as partner payouts: `AUTO_PAYOUTS=on` on the
 * deployment, the Payouts page's pause, and the same two ceilings -- a refund
 * and a payout count toward one daily total.
 */

export const REFUND_ACTOR = "system:auto-refund";

type Env = Record<string, string | undefined>;

export type AutoRefundReason = "shop-declined" | "deadline" | "paid-after-cancel";

/**
 * Why this cancelled, paid order may be refunded without a person deciding --
 * or `null` when it may not. Pure.
 */
export function autoRefundReason(input: {
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  capturedAt: Date | null;
  /** Whether `decidedBy` is a shop's or courier's own sign-in. */
  decidedByPartner: boolean;
}): AutoRefundReason | null {
  if (input.status !== "cancelled" || !input.capturedAt) return null;
  if (input.decidedAt && input.capturedAt.getTime() > input.decidedAt.getTime()) return "paid-after-cancel";
  if (input.decidedBy === RULES_ACTOR) return "deadline";
  if (input.decidedByPartner) return "shop-declined";
  return null;
}

export type RefundSkip =
  /** Not one of the three cancellations above. */
  | "needs-a-person"
  /** Part of the money has already been refunded or split by hand. */
  | "touched-by-hand"
  | "already-open"
  /** An automatic refund was tried before and did not arrive. */
  | "tried-before"
  | "no-number"
  | "below-minimum"
  | "above-ceiling"
  | "daily-ceiling";

/**
 * Whether one order's refund may be sent now, and for how much. Pure, so every
 * rule is testable without a database or ClickPesa.
 *
 * "In full" is literal: the amount is everything collected for the order, and
 * if the ledger shows anything else has happened to that money the decision is
 * left to a person.
 */
export function autoRefundDecision(
  input: {
    reason: AutoRefundReason | null;
    collectedTZS: number;
    refundedTZS: number;
    splitTZS: number;
    hasOpenSend: boolean;
    hasEarlierSend: boolean;
    phone: string | null;
  },
  config: Pick<AutoPayoutConfig, "maxPerPayoutTZS" | "maxPerDayTZS">,
  sentToday: number,
): { send: true; amountTZS: number } | { send: false; reason: RefundSkip } {
  if (!input.reason) return { send: false, reason: "needs-a-person" };
  if (input.hasOpenSend) return { send: false, reason: "already-open" };
  if (input.hasEarlierSend) return { send: false, reason: "tried-before" };
  if (input.refundedTZS !== 0 || input.splitTZS !== 0) return { send: false, reason: "touched-by-hand" };
  if (!input.phone) return { send: false, reason: "no-number" };
  if (input.collectedTZS < MIN_MOBILE_PAYOUT_TZS) return { send: false, reason: "below-minimum" };
  if (input.collectedTZS > config.maxPerPayoutTZS) return { send: false, reason: "above-ceiling" };
  if (sentToday + input.collectedTZS > config.maxPerDayTZS) return { send: false, reason: "daily-ceiling" };
  return { send: true, amountTZS: input.collectedTZS };
}

/** How far back a cancellation may be and still be refunded automatically. */
export const REFUND_WINDOW_DAYS = 60;

/** `R` + the row id, upper-cased. The leading letter tells a refund from a partner payout (`P`) by eye. */
export function refundRefFor(refundSendId: string): string {
  return `R${refundSendId.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Finding what is due
// ---------------------------------------------------------------------------

export interface RefundCandidate {
  orderId: string;
  reference: string;
  reason: AutoRefundReason | null;
  collectedTZS: number;
  phone: string | null;
  decision: ReturnType<typeof autoRefundDecision>;
}

/**
 * Every cancelled order that still holds a customer's money, with the
 * decision for each. Read-only.
 */
export async function findRefundCandidates(now: Date = new Date(), env: Env = process.env): Promise<RefundCandidate[]> {
  const db = getPrisma();
  const config = autoPayoutConfig(env);
  const orders = await db.order.findMany({
    // Bounded on purpose. Every cancelled order that was ever paid matches the
    // first two conditions for ever, refunded or not, so without a window the
    // list would fill with settled history and new refunds would fall off the
    // end of it. A refund still unsent after two months is the owner's.
    where: { status: "cancelled", payments: { some: { status: "captured" } }, decidedAt: { gte: new Date(now.getTime() - REFUND_WINDOW_DAYS * 86_400_000) } },
    orderBy: { decidedAt: "desc" },
    take: 300,
    select: {
      id: true,
      reference: true,
      status: true,
      decidedBy: true,
      decidedAt: true,
      payments: { where: { status: "captured" }, orderBy: { capturedAt: "asc" }, select: { capturedAt: true, payerPhone: true } },
      ledgerEntries: { select: { kind: true, amountTZS: true } },
      refundSends: { select: { status: true } },
    },
  });
  if (orders.length === 0) return [];

  const deciders = [...new Set(orders.map((o) => o.decidedBy).filter((uid): uid is string => Boolean(uid)))];
  const partnerUids = new Set((await db.partnerUser.findMany({ where: { uid: { in: deciders } }, select: { uid: true } })).map((p) => p.uid));

  let sentToday = await sentTodayTZS(now);
  const candidates: RefundCandidate[] = [];
  for (const order of orders) {
    const sum = (kinds: readonly string[]) => order.ledgerEntries.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.amountTZS, 0);
    const collectedTZS = sum(["collected"]);
    const refundedTZS = sum(["refund"]);
    const splitTZS = sum(SPLIT_KINDS);
    // Nothing left to give back: refunded already, by hand or by an earlier run.
    if (collectedTZS - refundedTZS - splitTZS <= 0) continue;

    const payment = order.payments[0];
    const reason = autoRefundReason({
      status: order.status,
      decidedBy: order.decidedBy,
      decidedAt: order.decidedAt,
      capturedAt: payment?.capturedAt ?? null,
      decidedByPartner: order.decidedBy != null && partnerUids.has(order.decidedBy),
    });
    const phone = toPayoutPhone(payment?.payerPhone);
    const decision = autoRefundDecision(
      {
        reason,
        collectedTZS,
        refundedTZS,
        splitTZS,
        hasOpenSend: order.refundSends.some((r) => r.status === "pending" || r.status === "sending"),
        hasEarlierSend: order.refundSends.some((r) => r.status === "failed" || r.status === "returned" || r.status === "sent"),
        phone,
      },
      config,
      sentToday,
    );
    // Two refunds in one list must not both fit under the day's ceiling by
    // each being measured against the same starting total.
    if (decision.send) sentToday += decision.amountTZS;
    candidates.push({ orderId: order.id, reference: order.reference, reason, collectedTZS, phone, decision });
  }
  return candidates;
}

/**
 * Whether a cancelled order's refund will be sent by MalFleks itself. Used by
 * the cancellation emails, so that the owner is not told "send this refund"
 * about money the site is about to send -- which is how a customer gets
 * refunded twice. Never throws; when it cannot tell, it says no, and the
 * owner is asked as he always was.
 */
export async function refundWillBeAutomatic(orderId: string, now: Date = new Date(), env: Env = process.env): Promise<boolean> {
  try {
    if (!autoPayoutConfig(env).armed || (await autoPayoutsPaused())) return false;
    const candidate = (await findRefundCandidates(now, env)).find((c) => c.orderId === orderId);
    return Boolean(candidate && (candidate.decision.send || candidate.decision.reason === "already-open"));
  } catch (error) {
    await logServerError("auto-refund-check", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Recording what ClickPesa said
// ---------------------------------------------------------------------------

const DONE = new Set(["SUCCESS"]);
const RETURNED = new Set(["REFUNDED", "REVERSED", "FAILED"]);

export type RefundSettleOutcome = "sent" | "failed" | "returned" | "still-sending" | "not-ours";

/**
 * Apply ClickPesa's word on a refund. Used by the send itself, by the status
 * check and by the webhook, so all three roads apply the same rules.
 *
 * - SUCCESS: `sending -> sent`, and the ledger's `refund` entry is written in
 *   the same transaction. This is the only place an automatic refund reaches
 *   the books.
 * - REFUNDED / REVERSED / FAILED while `sending`: the money never arrived. The
 *   row is `failed`; the books were never touched, so the order simply shows
 *   as needing a refund again.
 * - The same after `sent`: a network can reverse a payout minutes after
 *   reporting success. The row becomes `returned` and the ledger gets a
 *   second entry that cancels the first -- an entry is never edited -- so the
 *   books say what is true: the customer does not have the money.
 */
export async function settleRefundFromProvider(sendRef: string, record: ClickPesaPayoutRecord): Promise<{ outcome: RefundSettleOutcome; refundSendId: string | null }> {
  const db = getPrisma();
  const row = await db.refundSend.findUnique({ where: { sendRef }, select: { id: true, orderId: true, amountTZS: true } });
  if (!row) return { outcome: "not-ours", refundSendId: null };
  const providerRef = record.id ?? sendRef;

  if (DONE.has(record.status)) {
    const sent = await db.$transaction(async (tx) => {
      const { count } = await tx.refundSend.updateMany({
        where: { id: row.id, status: "sending" },
        data: {
          status: "sent",
          openOrderId: null,
          providerRef,
          finishedAt: new Date(),
          ...(record.feeTZS != null ? { feeTZS: Math.round(record.feeTZS) } : {}),
        },
      });
      if (count === 0) return false;
      await tx.ledgerEntry.create({
        data: { orderId: row.orderId, kind: "refund", amountTZS: row.amountTZS, note: `Refund ${providerRef} · sent automatically` },
      });
      return true;
    });
    return { outcome: sent ? "sent" : "still-sending", refundSendId: row.id };
  }

  if (RETURNED.has(record.status)) {
    const note = `ClickPesa reported ${record.status}: the refund did not reach the customer (reference ${sendRef})`;
    const outcome = await db.$transaction(async (tx) => {
      const neverArrived = await tx.refundSend.updateMany({
        where: { id: row.id, status: "sending" },
        data: { status: "failed", openOrderId: null, finishedAt: new Date(), failureNote: note },
      });
      if (neverArrived.count === 1) return "failed" as const;

      const cameBack = await tx.refundSend.updateMany({
        where: { id: row.id, status: "sent" },
        data: { status: "returned", finishedAt: new Date(), failureNote: note },
      });
      if (cameBack.count === 0) return "still-sending" as const;
      await tx.ledgerEntry.create({
        data: { orderId: row.orderId, kind: "refund", amountTZS: -row.amountTZS, note: `Refund ${sendRef} came back (${record.status}) · reversed automatically` },
      });
      return "returned" as const;
    });
    return { outcome, refundSendId: row.id };
  }

  return { outcome: "still-sending", refundSendId: row.id };
}

/** After a final answer: the customer is told the money was sent; the owner is told when it was not. */
async function tellPeople(refundSendId: string, outcome: RefundSettleOutcome): Promise<void> {
  if (outcome !== "sent" && outcome !== "failed" && outcome !== "returned") return;
  const row = await getPrisma().refundSend.findUnique({
    where: { id: refundSendId },
    select: { orderId: true, amountTZS: true, providerRef: true, sendRef: true, failureNote: true, order: { select: { reference: true } } },
  });
  if (!row) return;

  if (outcome === "sent") {
    const { notifyRefundRecorded } = await import("@/server/notify/events");
    await notifyRefundRecorded(row.orderId, row.amountTZS, row.providerRef ?? row.sendRef ?? "");
    const { resolveAlertFor } = await import("@/server/rules/alerts");
    await resolveAlertFor("refund-needs-owner", row.orderId, REFUND_ACTOR);
    return;
  }
  await alertOwner(row.orderId, row.order.reference, row.amountTZS, row.failureNote ?? "ClickPesa did not deliver it.");
}

async function alertOwner(orderId: string, reference: string, amountTZS: number, why: string): Promise<void> {
  const { raiseAlert } = await import("@/server/rules/alerts");
  await raiseAlert({
    key: "refund-needs-owner",
    subjectId: orderId,
    urgency: "urgent",
    subject: `Refund for ${reference} needs you`,
    body: [
      `MalFleks tried to refund TSh ${amountTZS.toLocaleString("en-US")} for the cancelled order ${reference} and could not.`,
      why,
      "",
      "The customer still does not have their money. It will not be tried again automatically.",
      "Send the refund from ClickPesa yourself, then record it on the Payouts page:",
    ].join("\n"),
    href: `/admin/orders/${orderId}`,
  });
}

/**
 * ClickPesa's word arriving by webhook: record it and tell whoever needs to
 * know. `not-ours` when the reference is not a refund MalFleks sent.
 */
export async function applyRefundAnswer(sendRef: string, record: ClickPesaPayoutRecord): Promise<RefundSettleOutcome> {
  const { outcome, refundSendId } = await settleRefundFromProvider(sendRef, record);
  if (refundSendId) await tellPeople(refundSendId, outcome);
  return outcome;
}

/** Ask ClickPesa about every refund still in `sending`. Safe to run any number of times. */
export async function settleSendingRefunds(limit = 5): Promise<{ refundSendId: string; outcome: RefundSettleOutcome }[]> {
  const sending = await getPrisma().refundSend.findMany({
    where: { status: "sending", sendRef: { not: null } },
    orderBy: { sendStartedAt: "asc" },
    take: limit,
    select: { id: true, sendRef: true },
  });
  const settled: { refundSendId: string; outcome: RefundSettleOutcome }[] = [];
  for (const row of sending) {
    const status = await queryPayoutStatus(row.sendRef!);
    if (!status.ok) {
      await logServerError("auto-refund-status", new Error(`${row.sendRef}: ${status.reason} ${status.detail ?? ""}`));
      continue;
    }
    // "Not found" is not proof that it never arrived. Only a person may decide that.
    if (!status.found) continue;
    const { outcome } = await settleRefundFromProvider(row.sendRef!, status.record);
    if (outcome === "sent" || outcome === "failed" || outcome === "returned") {
      settled.push({ refundSendId: row.id, outcome });
      await tellPeople(row.id, outcome);
    }
  }
  return settled;
}

/** How many refunds are waiting on ClickPesa's answer. Costs no API call. */
export function countSendingRefunds(): Promise<number> {
  return getPrisma().refundSend.count({ where: { status: "sending" } });
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export interface AutoRefundRun {
  skipped?: "off" | "paused" | "sent-just-now";
  settled: { refundSendId: string; outcome: RefundSettleOutcome }[];
  sent?: { orderId: string; reference: string; amountTZS: number; result: "sent" | "sending" | "refused" | "unknown" | "try-later"; detail?: string };
  /** Refunds a person has to send, and why. */
  leftForOwner: { orderId: string; reference: string; amountTZS: number; reason: RefundSkip }[];
}

/** The reasons worth telling the owner about. The rest are either normal or already reported. */
const OWNER_MUST_SEND: ReadonlySet<RefundSkip> = new Set(["no-number", "below-minimum", "above-ceiling"]);

const SKIP_WORDS: Record<RefundSkip, string> = {
  "needs-a-person": "It was cancelled by an admin, so how much to refund is your decision.",
  "touched-by-hand": "Part of this order's money has already been refunded or paid out by hand.",
  "already-open": "A refund is already on its way.",
  "tried-before": "An automatic refund was tried before and did not arrive.",
  "no-number": "MalFleks does not know which mobile-money number paid for it.",
  "below-minimum": `It is under TSh ${MIN_MOBILE_PAYOUT_TZS.toLocaleString("en-US")}, the least ClickPesa will send to a phone.`,
  "above-ceiling": "It is more than the largest amount MalFleks may send by itself.",
  "daily-ceiling": "Today's limit on money sent automatically has been reached; it will be sent tomorrow.",
};

/**
 * One pass: settle what is in flight, then send at most one refund.
 * Never throws -- every failure is logged and reported in the result.
 *
 * `settleInFlight: false` is for a caller that has no ClickPesa calls to spare.
 */
export async function runAutoRefunds(now: Date = new Date(), env: Env = process.env, options: { settleInFlight?: boolean } = {}): Promise<AutoRefundRun> {
  const run: AutoRefundRun = { settled: [], leftForOwner: [] };
  try {
    // Refunds already sent are settled whether or not sending is on: the money
    // left, and the books and the customer should hear what happened to it.
    if (options.settleInFlight !== false) run.settled = await settleSendingRefunds();

    const config = autoPayoutConfig(env);
    if (!config.armed) return { ...run, skipped: "off" };
    if (await autoPayoutsPaused()) return { ...run, skipped: "paused" };

    const candidates = await findRefundCandidates(now, env);
    let chosen: RefundCandidate | undefined;
    for (const c of candidates) {
      if (c.decision.send) {
        chosen ??= c;
        continue;
      }
      if (OWNER_MUST_SEND.has(c.decision.reason) && c.reason) {
        run.leftForOwner.push({ orderId: c.orderId, reference: c.reference, amountTZS: c.collectedTZS, reason: c.decision.reason });
        await alertOwner(c.orderId, c.reference, c.collectedTZS, SKIP_WORDS[c.decision.reason]);
      }
    }
    // `decision.send` already established that there is a reason and a number.
    if (!chosen?.reason || !chosen.phone) return run;
    if (await sentJustNow(now)) return { ...run, skipped: "sent-just-now" };

    run.sent = await sendOne(chosen.orderId, chosen.reference, chosen.reason, chosen.phone, now);
    return run;
  } catch (error) {
    await logServerError("auto-refund-run", error);
    return run;
  }
}

type DrawOutcome = { ok: true; id: string; amountTZS: number } | { ok: false; why: string };

/**
 * Create the `RefundSend` row, under a lock on the order, from what the ledger
 * says at that moment. The list this order was chosen from was read a moment
 * ago and outside any lock; this is where "still cancelled, still unrefunded,
 * nothing else in flight" is actually established.
 */
async function drawUp(orderId: string, reason: AutoRefundReason, phone: string): Promise<DrawOutcome> {
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR NO KEY UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (order?.status !== "cancelled") return { ok: false, why: "the order is no longer cancelled" } as const;

    const existing = await tx.refundSend.count({ where: { orderId } });
    if (existing > 0) return { ok: false, why: "a refund for this order has already been drawn up" } as const;

    const groups = await tx.ledgerEntry.groupBy({ by: ["kind"], where: { orderId }, _sum: { amountTZS: true } });
    const sum = (k: string) => groups.find((g) => g.kind === k)?._sum.amountTZS ?? 0;
    const collected = sum("collected");
    if (collected <= 0 || sum("refund") !== 0 || SPLIT_KINDS.some((k) => sum(k) !== 0)) {
      return { ok: false, why: "the order's money has changed since it was chosen" } as const;
    }

    const row = await tx.refundSend.create({
      data: { orderId, openOrderId: orderId, amountTZS: collected, phone, reason },
      select: { id: true },
    });
    return { ok: true, id: row.id, amountTZS: collected } as const;
  });
}

/** A refund that was drawn up and that ClickPesa definitely did not send. */
async function markNotSent(id: string, why: string): Promise<void> {
  await getPrisma().refundSend.updateMany({
    where: { id, status: { in: ["pending", "sending"] } },
    data: { status: "failed", openOrderId: null, finishedAt: new Date(), failureNote: why.slice(0, 500) },
  });
}

/**
 * A refund that was drawn up and never left because ClickPesa could not be
 * asked at all. Nothing happened, so no trace is kept: the row is removed and
 * the next pass draws it up again. Only a row that never got a `sendRef` can
 * match -- one that might have left is never removed.
 */
async function forgetUnsent(id: string): Promise<void> {
  await getPrisma().refundSend.deleteMany({ where: { id, status: "pending", sendRef: null } });
}

async function sendOne(orderId: string, reference: string, reason: AutoRefundReason, phoneNumber: string, now: Date): Promise<NonNullable<AutoRefundRun["sent"]>> {
  const db = getPrisma();

  // 1. Draw it up.
  const drawn = await drawUp(orderId, reason, phoneNumber);
  if (!drawn.ok) return { orderId, reference, amountTZS: 0, result: "refused", detail: drawn.why };
  const { id, amountTZS } = drawn;
  const sendRef = refundRefFor(id);
  const base = { orderId, reference, amountTZS };

  // 2. Would ClickPesa send it? This sends nothing, so a "no" is safe to act on.
  const preview = await previewMobilePayout({ amountTZS, phoneNumber, orderReference: sendRef });
  if (!preview.ok) {
    if (preview.reason !== "refused") {
      await forgetUnsent(id);
      return { ...base, result: "try-later", detail: `Could not ask ClickPesa (${preview.reason}): ${preview.detail ?? ""}` };
    }
    const detail = `ClickPesa would not send it (${preview.status}): ${preview.detail}`;
    await markNotSent(id, `Automatic refund not sent. ${detail}`);
    await logServerError("auto-refund-preview", new Error(`${sendRef}: ${detail}`));
    await alertOwner(orderId, reference, amountTZS, detail);
    return { ...base, result: "refused", detail };
  }
  if (preview.balanceTZS != null && preview.balanceTZS < preview.totalTZS) {
    const detail = `ClickPesa holds TSh ${preview.balanceTZS}, and this refund needs TSh ${preview.totalTZS} with its fee.`;
    await markNotSent(id, `Automatic refund not sent. ${detail}`);
    await logServerError("auto-refund-balance", new Error(`${sendRef}: ${detail}`));
    await alertOwner(orderId, reference, amountTZS, detail);
    return { ...base, result: "refused", detail };
  }

  // 3. Claim the right to send; the reference is on record before the request leaves.
  const claimed = await db.refundSend.updateMany({
    where: { id, status: "pending", sendRef: null },
    // The run's own clock: the daily ceiling and the one-a-minute pace are both measured against it.
    data: { status: "sending", sendRef, sendStartedAt: now, feeTZS: Math.round(preview.feeTZS) },
  });
  if (claimed.count !== 1) return { ...base, result: "refused", detail: "someone else acted on this refund first" };

  // 4. Send.
  const created = await createMobilePayout({ amountTZS, phoneNumber, orderReference: sendRef });

  if (created.ok) {
    const { outcome } = await settleRefundFromProvider(sendRef, created.record);
    await tellPeople(id, outcome);
    return { ...base, result: outcome === "sent" ? "sent" : outcome === "failed" || outcome === "returned" ? "refused" : "sending" };
  }

  if (created.reason === "refused" || created.reason === "auth-failed") {
    // A definite no: rejected, or never sent for want of a token.
    const detail = created.reason === "refused" ? `ClickPesa refused it (${created.status}): ${created.detail}` : `No ClickPesa token: ${created.detail ?? ""}`;
    await markNotSent(id, `Automatic refund not sent. ${detail}`);
    await logServerError("auto-refund-create", new Error(`${sendRef}: ${detail}`));
    await alertOwner(orderId, reference, amountTZS, detail);
    return { ...base, result: "refused", detail };
  }

  // "duplicate-reference" or "unknown": ClickPesa may hold this refund. It
  // stays `sending`; the next pass asks by reference. It is never sent again.
  await logServerError("auto-refund-create", new Error(`${sendRef}: outcome not known (${created.reason}${"detail" in created && created.detail ? `: ${created.detail}` : ""}) -- left as sending`));
  return { ...base, result: "unknown", detail: created.reason };
}

/**
 * The owner pressing "Try the refund again" after fixing what stopped it (he
 * topped up ClickPesa, say). Only a refund that **never left** can be tried
 * again: a row that was ever `sending` keeps its record and blocks a retry,
 * because for that one the owner has to check ClickPesa himself.
 */
export async function allowRefundRetry(orderId: string): Promise<boolean> {
  const { count } = await getPrisma().refundSend.deleteMany({ where: { orderId, status: "failed", sendStartedAt: null } });
  return count > 0;
}
