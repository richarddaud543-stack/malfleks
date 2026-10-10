import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { sendCustomerEmail, sendPartnerEmail } from "@/server/notify/email";
import { notifyOrderCancelled, partnerContact } from "@/server/notify/events";
import { deliveryOverdueMessage, orderCancelledPartnerMessage, paymentReminderMessage } from "@/server/notify/rule-messages";
import { WRONG_BEFORE_LOCK } from "@/server/orders/delivery-code";
import { cancelPaidOrderByRule, cancelUnpaidOrderByRule, RULES_ACTOR } from "@/server/orders/status";
import { readGatewayState } from "@/server/payments/gateway-state";
import { reconcilePayment } from "@/server/payments/reconcile";
import { raiseAlert, resolveAlertFor, subjectsBeingHandled } from "../alerts";
import { claimOnce, marksFor } from "../marks";
import { HOUR_MS, MAX_PER_RULE, UNDELIVERED, UNPAID } from "../thresholds";
import type { Rule, RuleContext } from "../types";

/**
 * The rules about orders that have stopped moving.
 *
 * `src/server/orders/stuck.ts` already *lists* these for the owner once a day
 * and says, in its own header, that it "cancels nothing ... a job that quietly
 * cancelled orders would be making [the policy] for him". On 10 Oct 2026 the
 * owner made that policy: an unpaid order lapses after a day, and a paid one
 * the shop does not deliver is cancelled and refunded. These rules carry it
 * out. The daily list is still sent.
 *
 * Every rule here warns before it acts, and never acts sooner than a set time
 * after the warning went out -- so nothing is ever cancelled that nobody was
 * told about, including on the first pass after this was switched on.
 */

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / HOUR_MS));
}

function firstName(fullName: string): string | null {
  return fullName.trim().split(/\s+/)[0] || null;
}

// ---------------------------------------------------------------------------
// Unpaid
// ---------------------------------------------------------------------------

/** The note stored on an order the rulebook cancelled for not being paid. Quoted to the customer, so both languages. */
export const UNPAID_CANCEL_NOTE = `Haikulipiwa ndani ya saa ${UNPAID.cancelAfterHours} / Not paid within ${UNPAID.cancelAfterHours} hours`;

interface UnpaidOrder {
  id: string;
  reference: string;
  productName: string;
  customerFullName: string;
  customerEmail: string | null;
  quoteOrderTotalTZS: number | null;
  /** When the customer was first given a way to pay. The clock starts here, not when the order was placed. */
  payableSince: Date;
  paymentIds: string[];
}

/** Orders with a pay link and no payment, oldest first. */
async function unpaidOrders(olderThanHours: number, now: Date): Promise<UnpaidOrder[]> {
  const rows = await getPrisma().order.findMany({
    where: {
      status: { in: ["pending", "confirmed"] },
      payments: { some: { initiatedAt: { lt: new Date(now.getTime() - olderThanHours * HOUR_MS) } }, none: { status: "captured" } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      reference: true,
      productName: true,
      customerFullName: true,
      customerEmail: true,
      quoteOrderTotalTZS: true,
      payments: { orderBy: { initiatedAt: "asc" }, select: { id: true, initiatedAt: true } },
    },
  });
  return rows
    .filter((o) => o.payments.length > 0)
    .map((o) => ({
      id: o.id,
      reference: o.reference,
      productName: o.productName,
      customerFullName: o.customerFullName,
      customerEmail: o.customerEmail,
      quoteOrderTotalTZS: o.quoteOrderTotalTZS,
      payableSince: o.payments[0].initiatedAt,
      paymentIds: o.payments.map((p) => p.id),
    }));
}

export const unpaidReminder: Rule = {
  key: "unpaid-reminder",
  group: "orders",
  title: "Remind a customer who has not paid",
  when: `An order has had a pay link for ${UNPAID.remindAfterHours} hour and is still unpaid.`,
  then: "The customer gets one email with the pay link and the time left before the order lapses.",
  async run(ctx) {
    // Asking someone to pay while payment is impossible only produces a
    // second, angrier email from them.
    if (!ctx.gatewayUp) return { acted: 0, notes: [] };

    const orders = (await unpaidOrders(UNPAID.remindAfterHours, ctx.now)).filter(
      (o) => ctx.now.getTime() - o.payableSince.getTime() < UNPAID.remindWithinDays * 24 * HOUR_MS,
    );
    const reminded = await marksFor("unpaid-reminder", orders.map((o) => o.id));

    const notes: string[] = [];
    for (const order of orders) {
      if (notes.length >= MAX_PER_RULE) break;
      if (reminded.has(order.id) || order.quoteOrderTotalTZS == null) continue;
      if (!(await claimOnce("unpaid-reminder", order.id, ctx.now))) continue;

      const age = hoursBetween(order.payableSince, ctx.now);
      const { subject, body } = paymentReminderMessage({
        firstName: firstName(order.customerFullName),
        reference: order.reference,
        productName: order.productName,
        totalTZS: order.quoteOrderTotalTZS,
        // Never promises less time than the cancel rule will actually give.
        hoursLeft: Math.max(UNPAID.minHoursAfterReminder, UNPAID.cancelAfterHours - age),
        siteUrl: resolveSiteUrl(ctx.env),
      });
      const sent = await sendCustomerEmail(order.customerEmail, subject, body, ctx.env);
      if (!sent.sent && sent.reason !== "no-address" && sent.reason !== "not-configured") {
        await logServerError("rule-unpaid-reminder", new Error(`Could not remind the customer about ${order.reference}: ${sent.reason}`));
      }
      notes.push(`Reminded the customer to pay for ${order.reference}.`);
    }
    return { acted: notes.length, notes };
  },
};

/**
 * Whether an unpaid order may be cancelled now. Pure.
 *
 * `remindedAt` is when its reminder went out, or null if it never got one.
 * `payableAgainSince` is when ClickPesa last came back from an outage, if it
 * has: time during which nobody *could* pay does not count against a customer.
 */
export function unpaidCancelDue(input: { payableSince: Date; remindedAt: Date | null; payableAgainSince: Date | null }, now: Date): boolean {
  const age = now.getTime() - input.payableSince.getTime();
  if (age < UNPAID.cancelAfterHours * HOUR_MS) return false;
  if (input.payableAgainSince && input.payableSince < input.payableAgainSince && now.getTime() - input.payableAgainSince.getTime() < UNPAID.minHoursAfterReminder * HOUR_MS) {
    return false;
  }
  if (input.remindedAt) return now.getTime() - input.remindedAt.getTime() >= UNPAID.minHoursAfterReminder * HOUR_MS;
  // Never reminded. Only an order too old to have been sent a reminder is
  // cancelled without one; a younger one waits for its reminder first.
  return age >= UNPAID.remindWithinDays * 24 * HOUR_MS;
}

/**
 * What `reconcilePayment` reports when ClickPesa has no payment under way on a
 * link: nobody has tried it, or the only attempt failed. Any other status is
 * an attempt that might still succeed, and the order is left alone.
 */
const NOTHING_IN_PROGRESS: ReadonlySet<string> = new Set(["NO_ATTEMPTS", "FAILED"]);

export const unpaidCancel: Rule = {
  key: "unpaid-cancel",
  group: "orders",
  title: "Cancel an order nobody paid for",
  when: `An order is still unpaid ${UNPAID.cancelAfterHours} hours after the customer was given the pay link (and at least ${UNPAID.minHoursAfterReminder} hours after the reminder).`,
  then: "The site asks ClickPesa one last time. If there is still no payment the order is cancelled, the shop's stock is free again, and the customer is told nothing was charged.",
  needsGateway: true,
  async run(ctx) {
    const state = await readGatewayState();
    const payableAgainSince = state?.status === "up" && state.lastOutage ? new Date(state.lastOutage.until) : null;

    const orders = await unpaidOrders(UNPAID.cancelAfterHours, ctx.now);
    const reminded = await marksFor("unpaid-reminder", orders.map((o) => o.id));

    const notes: string[] = [];
    for (const order of orders) {
      if (notes.length >= MAX_PER_RULE || ctx.timeLeftMs() < 15_000) break;
      if (!unpaidCancelDue({ payableSince: order.payableSince, remindedAt: reminded.get(order.id) ?? null, payableAgainSince }, ctx.now)) continue;

      // One last look, at every link this order was given. A customer who paid
      // an hour ago on a webhook that never arrived must not be cancelled.
      if (ctx.callsLeft() < order.paymentIds.length + 2) break;
      let safeToCancel = true;
      for (const paymentId of order.paymentIds) {
        const result = await reconcilePayment(paymentId);
        // Paid, or the check could not be made: either way, not this pass.
        if (!result || result.outcome !== "waiting") safeToCancel = false;
        // ClickPesa has an attempt in progress on this link (PROCESSING, PENDING...).
        else if (result.providerStatus && !NOTHING_IN_PROGRESS.has(result.providerStatus)) safeToCancel = false;
        if (!safeToCancel) break;
      }
      if (!safeToCancel) continue;

      // The write itself refuses an order with a captured payment, so a
      // payment landing between the check above and here still wins.
      const outcome = await cancelUnpaidOrderByRule(order.id, UNPAID_CANCEL_NOTE);
      if (!outcome.ok) continue;
      await notifyOrderCancelled(order.id);
      notes.push(`Cancelled ${order.reference}: not paid within ${UNPAID.cancelAfterHours} hours.`);
    }
    return { acted: notes.length, notes };
  },
};

// ---------------------------------------------------------------------------
// Paid and not delivered
// ---------------------------------------------------------------------------

/** The note stored on an order the rulebook cancelled for lateness. Quoted to the customer, so both languages. */
export const LATE_CANCEL_NOTE = `Haikufika ndani ya siku ${UNDELIVERED.cancelAfterHours / 24} baada ya malipo / Not delivered within ${UNDELIVERED.cancelAfterHours / 24} days of payment`;

interface PaidOrder {
  id: string;
  reference: string;
  productName: string;
  branchId: string | null;
  agentId: string | null;
  branchName: string;
  routeKind: string;
  paidAt: Date;
  hoursWaiting: number;
  /** The partner reported a problem, or the code is locked: an admin's to settle. */
  withAdmin: boolean;
  /** The courier's phone has reported in recently: it is on its way. */
  moving: boolean;
}

/** Paid, confirmed, not delivered, for at least this long -- oldest payment first. */
async function paidUndelivered(olderThanHours: number, now: Date): Promise<PaidOrder[]> {
  const rows = await getPrisma().order.findMany({
    where: {
      status: "confirmed",
      payments: { some: { status: "captured", capturedAt: { lt: new Date(now.getTime() - olderThanHours * HOUR_MS) } } },
    },
    take: 200,
    select: {
      id: true,
      reference: true,
      productName: true,
      branchId: true,
      agentId: true,
      branchName: true,
      routeKind: true,
      payments: { where: { status: "captured" }, orderBy: { capturedAt: "asc" }, take: 1, select: { capturedAt: true } },
      deliveryCode: { select: { problemAt: true, wrongAttempts: true } },
      deliveryPings: { where: { createdAt: { gte: new Date(now.getTime() - 24 * HOUR_MS) } }, take: 1, select: { id: true } },
    },
  });
  return rows
    .filter((o) => o.payments[0]?.capturedAt)
    .map((o) => {
      const paidAt = o.payments[0].capturedAt!;
      return {
        id: o.id,
        reference: o.reference,
        productName: o.productName,
        branchId: o.branchId,
        agentId: o.agentId,
        branchName: o.branchName,
        routeKind: o.routeKind,
        paidAt,
        hoursWaiting: hoursBetween(paidAt, now),
        withAdmin: Boolean(o.deliveryCode?.problemAt) || (o.deliveryCode?.wrongAttempts ?? 0) >= WRONG_BEFORE_LOCK,
        moving: o.deliveryPings.length > 0,
      };
    })
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
}

/** Email whoever is meant to move this order. Returns how many were written to. */
async function tellPartners(order: PaidOrder, message: { subject: string; body: string }, ctx: RuleContext, context: string): Promise<number> {
  const keys = [order.branchId ? { branchId: order.branchId } : null, order.routeKind === "agent" && order.agentId ? { agentId: order.agentId } : null];
  let told = 0;
  for (const key of keys) {
    if (!key) continue;
    const contact = await partnerContact(key);
    if (!contact?.email || contact.status !== "active") continue;
    const sent = await sendPartnerEmail(contact.email, message.subject, message.body, ctx.env);
    if (sent.sent) told += 1;
    else if (sent.reason !== "no-address" && sent.reason !== "not-configured") {
      await logServerError(context, new Error(`Could not email ${contact.displayName} about ${order.reference}: ${sent.reason}`));
    }
  }
  return told;
}

export const deliveryReminder: Rule = {
  key: "delivery-reminder",
  group: "orders",
  title: "Remind the shop about a paid order",
  when: `An order was paid ${UNDELIVERED.remindPartnerAfterHours} hours ago and has not been marked delivered.`,
  then: "The shop (and the courier, if there is one) gets one reminder, with how the customer's code works.",
  async run(ctx) {
    const orders = (await paidUndelivered(UNDELIVERED.remindPartnerAfterHours, ctx.now)).filter(
      // Past the last-warning hour the last warning is the message to send, not this one.
      (o) => o.hoursWaiting < UNDELIVERED.finalWarningAfterHours && !o.withAdmin,
    );
    const done = await marksFor("delivery-reminder", orders.map((o) => o.id));

    const notes: string[] = [];
    for (const order of orders) {
      if (notes.length >= MAX_PER_RULE) break;
      if (done.has(order.id) || !(await claimOnce("delivery-reminder", order.id, ctx.now))) continue;
      const message = deliveryOverdueMessage({
        reference: order.reference,
        productName: order.productName,
        hoursWaiting: order.hoursWaiting,
        final: false,
        hoursLeft: 0,
        siteUrl: resolveSiteUrl(ctx.env),
      });
      await tellPartners(order, message, ctx, "rule-delivery-reminder");
      notes.push(`Reminded ${order.branchName} that ${order.reference} is paid and not delivered.`);
    }
    return { acted: notes.length, notes };
  },
};

export const deliveryAlert: Rule = {
  key: "delivery-late",
  group: "orders",
  title: "Tell you about a late delivery",
  when: `An order was paid ${UNDELIVERED.alertOwnerAfterHours / 24} days ago and has not been delivered.`,
  then: `You are emailed once. If you do nothing, the shop gets a last warning on day ${UNDELIVERED.finalWarningAfterHours / 24} and the order is cancelled and refunded on day ${UNDELIVERED.cancelAfterHours / 24}. Press "I'm handling this" to stop that.`,
  async run(ctx) {
    const notes: string[] = [];
    const orders = await paidUndelivered(UNDELIVERED.alertOwnerAfterHours, ctx.now);
    for (const order of orders) {
      if (notes.length >= MAX_PER_RULE) break;
      const { raised } = await raiseAlert(
        {
          key: "delivery-late",
          subjectId: order.id,
          urgency: "routine",
          subject: `${order.reference} was paid ${Math.floor(order.hoursWaiting / 24)} days ago and is not delivered`,
          body: [
            `${order.productName}, from ${order.branchName}. The customer paid ${Math.floor(order.hoursWaiting / 24)} days ago.`,
            order.withAdmin
              ? "The shop has reported a problem with this delivery (or the code is locked), so it will NOT be cancelled automatically. It is yours to settle."
              : `If nothing changes it will be cancelled and the customer refunded in full ${UNDELIVERED.cancelAfterHours / 24} days after payment.`,
            "",
            'If you are sorting it out with the shop, press "I\'m handling this" on the Rules page and the rules will leave it alone.',
          ].join("\n"),
          href: `/admin/orders/${order.id}`,
        },
        ctx.env,
      );
      if (raised) notes.push(`Told you that ${order.reference} is ${Math.floor(order.hoursWaiting / 24)} days late.`);
    }

    // An alert about an order that has since been delivered or cancelled is
    // finished business; close it so the list only holds what is still true.
    const open = await getPrisma().ownerAlert.findMany({
      where: { key: "delivery-late", status: { in: ["open", "handling"] }, openKey: { not: null } },
      select: { openKey: true },
      take: 100,
    });
    const orderIds = open.map((a) => (a.openKey ?? "").slice("delivery-late:".length)).filter(Boolean);
    if (orderIds.length > 0) {
      const still = new Set((await getPrisma().order.findMany({ where: { id: { in: orderIds }, status: "confirmed" }, select: { id: true } })).map((o) => o.id));
      for (const id of orderIds) if (!still.has(id)) await resolveAlertFor("delivery-late", id, RULES_ACTOR);
    }
    return { acted: notes.length, notes };
  },
};

export const deliveryFinalWarning: Rule = {
  key: "delivery-final-warning",
  group: "orders",
  title: "Give the shop a last warning",
  when: `An order was paid ${UNDELIVERED.finalWarningAfterHours / 24} days ago and has not been delivered.`,
  then: `The shop is told the order will be cancelled and refunded in ${UNDELIVERED.minHoursAfterFinalWarning} hours, and how to stop that if it was in fact delivered.`,
  async run(ctx) {
    const orders = (await paidUndelivered(UNDELIVERED.finalWarningAfterHours, ctx.now)).filter((o) => !o.withAdmin);
    const done = await marksFor("delivery-final-warning", orders.map((o) => o.id));
    const handled = await subjectsBeingHandled("delivery-late", orders.map((o) => o.id));

    const notes: string[] = [];
    for (const order of orders) {
      if (notes.length >= MAX_PER_RULE) break;
      if (done.has(order.id) || handled.has(order.id)) continue;
      if (!(await claimOnce("delivery-final-warning", order.id, ctx.now))) continue;
      const message = deliveryOverdueMessage({
        reference: order.reference,
        productName: order.productName,
        hoursWaiting: order.hoursWaiting,
        final: true,
        // Never promises less time than the cancel rule will actually give.
        hoursLeft: Math.max(UNDELIVERED.minHoursAfterFinalWarning, UNDELIVERED.cancelAfterHours - order.hoursWaiting),
        siteUrl: resolveSiteUrl(ctx.env),
      });
      await tellPartners(order, message, ctx, "rule-delivery-final-warning");
      notes.push(`Gave ${order.branchName} a last warning about ${order.reference}.`);
    }
    return { acted: notes.length, notes };
  },
};

/**
 * Whether a paid, undelivered order may be cancelled now. Pure.
 *
 * Every "no" here is a case where a person knows something the clock does
 * not: the shop reported a problem, the owner said he is dealing with it, the
 * courier is on the road, or the shop was never warned.
 */
export function lateCancelDue(
  input: { paidAt: Date; warnedAt: Date | null; withAdmin: boolean; moving: boolean; ownerHandling: boolean },
  now: Date,
): boolean {
  if (input.withAdmin || input.moving || input.ownerHandling) return false;
  if (now.getTime() - input.paidAt.getTime() < UNDELIVERED.cancelAfterHours * HOUR_MS) return false;
  if (!input.warnedAt) return false;
  return now.getTime() - input.warnedAt.getTime() >= UNDELIVERED.minHoursAfterFinalWarning * HOUR_MS;
}

export const deliveryCancel: Rule = {
  key: "delivery-cancel",
  group: "orders",
  title: "Cancel a paid order the shop did not deliver",
  when: `An order was paid ${UNDELIVERED.cancelAfterHours / 24} days ago, the shop was warned at least ${UNDELIVERED.minHoursAfterFinalWarning} hours ago, nobody has reported a problem, the courier is not on the road, and you have not said you are handling it.`,
  then: "The order is cancelled, the customer is told, the shop is told not to deliver it, and the full refund is sent by the refund rule.",
  async run(ctx) {
    const orders = await paidUndelivered(UNDELIVERED.cancelAfterHours, ctx.now);
    const warned = await marksFor("delivery-final-warning", orders.map((o) => o.id));
    const handled = await subjectsBeingHandled("delivery-late", orders.map((o) => o.id));

    const notes: string[] = [];
    for (const order of orders) {
      if (notes.length >= MAX_PER_RULE || ctx.timeLeftMs() < 10_000) break;
      const due = lateCancelDue(
        { paidAt: order.paidAt, warnedAt: warned.get(order.id) ?? null, withAdmin: order.withAdmin, moving: order.moving, ownerHandling: handled.has(order.id) },
        ctx.now,
      );
      if (!due) continue;

      // Guarded on `confirmed`: an order delivered a second ago matches nothing.
      const outcome = await cancelPaidOrderByRule(order.id, LATE_CANCEL_NOTE);
      if (!outcome.ok) continue;
      await notifyOrderCancelled(order.id);
      await tellPartners(order, orderCancelledPartnerMessage({ reference: order.reference, productName: order.productName, siteUrl: resolveSiteUrl(ctx.env) }), ctx, "rule-delivery-cancel");
      await resolveAlertFor("delivery-late", order.id, RULES_ACTOR);
      notes.push(`Cancelled ${order.reference}: paid ${Math.floor(order.hoursWaiting / 24)} days ago and not delivered. The customer will be refunded.`);
    }
    return { acted: notes.length, notes };
  },
};
