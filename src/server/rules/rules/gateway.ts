import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { sendCustomerEmail } from "@/server/notify/email";
import { checkoutOpenMessage } from "@/server/notify/rule-messages";
import { openCheckout } from "@/server/orders/checkout";
import { RULES_ACTOR } from "@/server/orders/status";
import { checkGateway } from "@/server/payments/clickpesa";
import { readGatewayState, recordGatewayObservation, type GatewayState } from "@/server/payments/gateway-state";
import { reconcilePayment } from "@/server/payments/reconcile";
import { raiseAlert, resolveAlertFor } from "../alerts";
import { claimOnce } from "../marks";
import { HOUR_MS, MAX_PER_RULE, UNPAID } from "../thresholds";
import { NOTHING, type Rule, type RuleContext } from "../types";

/**
 * The rules about ClickPesa itself: is it answering, and what did customers
 * do there that the site has not heard about.
 */

// ---------------------------------------------------------------------------
// Is ClickPesa answering?
// ---------------------------------------------------------------------------

/** While up and idle, how often ClickPesa is asked just to see that it still answers. */
const IDLE_CHECK_EVERY_HOURS = 3;
/** For this long after it goes down it is asked on every pass; after that, once an hour. */
const DOWN_CHECK_EVERY_PASS_FOR_HOURS = 2;

export type ProbeKind =
  /** Ask for a new token: the only real evidence. One API call. */
  | "ask"
  /** There is work to do anyway. Use the token already held if there is one. */
  | "with-work"
  /** Do not ask this pass. */
  | "wait";

/**
 * Whether to spend an API call finding out. Pure.
 *
 * The account allows a hundred calls a day and a pass runs ninety-six times,
 * so "ask every time" would use the whole allowance on asking. The balance
 * struck here: ask freely when there is doubt (never observed, one failure
 * seen, freshly down), ask hourly through a long outage, and when all is well
 * let the real work be the evidence -- with one quiet check every few hours so
 * that an idle shop still notices.
 */
export function probeKind(state: GatewayState | null, now: Date, hasWork: boolean): ProbeKind {
  if (!state || state.status === "suspect") return "ask";
  const sinceChecked = now.getTime() - Date.parse(state.checkedAt);
  if (state.status === "down") {
    const downFor = now.getTime() - Date.parse(state.since);
    if (downFor < DOWN_CHECK_EVERY_PASS_FOR_HOURS * HOUR_MS) return "ask";
    return sinceChecked >= HOUR_MS ? "ask" : "wait";
  }
  if (!Number.isFinite(sinceChecked) || sinceChecked >= IDLE_CHECK_EVERY_HOURS * HOUR_MS) return "ask";
  return hasWork ? "with-work" : "wait";
}

/**
 * Will this pass certainly ask ClickPesa something? Reads rows; costs no API
 * call.
 *
 * Deliberately narrow. A "yes" makes the pass fetch a token if it holds none,
 * and a token is one of the day's hundred requests -- so a condition that
 * stays true for days without leading to a request (an unpaid order nobody is
 * due to re-check, a partner owed money who has no phone number on file)
 * would spend the whole allowance on tokens for work that never happens.
 * Only work that is due *now* counts. Anything else that turns out to need
 * ClickPesa this pass simply asks for its own token when it gets there.
 */
export async function clickPesaWorkWaiting(ctx: Pick<RuleContext, "now">): Promise<boolean> {
  const db = getPrisma();
  const [sendingPayouts, sendingRefunds] = await Promise.all([db.payoutBatch.count({ where: { status: "sending" } }), db.refundSend.count({ where: { status: "sending" } })]);
  if (sendingPayouts + sendingRefunds > 0) return true;
  return (await paymentsDueForRecheck(ctx.now)).length > 0;
}

export const gatewayWatch: Rule = {
  key: "gateway-watch",
  group: "payments",
  title: "Watch ClickPesa",
  when: "ClickPesa stops answering the site (two checks in a row).",
  then: "You are emailed and texted at once, the pay page stops sending customers to a link that cannot work, and you are told when it is back.",
  alwaysRuns: true,
  async run(ctx) {
    const configured = Boolean(ctx.env.CLICKPESA_CLIENT_ID?.trim() && ctx.env.CLICKPESA_API_KEY?.trim());
    if (!configured) {
      ctx.gatewayUp = false;
      return { acted: 0, notes: ["ClickPesa keys are not set on this deployment; nothing that needs ClickPesa ran."] };
    }

    const state = await readGatewayState();
    if (ctx.callsLeft() < 1) {
      // The day's allowance is spent. Not asking is not the same as "down":
      // the recorded state is left alone, and the rules that need ClickPesa
      // simply do not run until tomorrow.
      ctx.gatewayUp = false;
      const day = ctx.now.toISOString().slice(0, 10);
      if (await claimOnce("api-budget-spent", day, ctx.now)) {
        await raiseAlert({
          key: "api-budget-spent",
          subjectId: day,
          urgency: "routine",
          subject: "Today's ClickPesa checks are used up",
          body: [
            "The rules have made as many requests to ClickPesa today as they are allowed.",
            "Payments still arrive (ClickPesa tells the site itself), and customers can still pay.",
            "What waits until tomorrow: re-checking unpaid orders, automatic refunds and payouts.",
            "",
            "If this happens often, the account's daily allowance is too small for the number of orders.",
            "It rises when ClickPesa verifies the business.",
          ].join("\n"),
          href: "/admin/rules",
        });
      }
      return { acted: 0, notes: ["ClickPesa allowance for today is spent; nothing that needs ClickPesa ran."] };
    }

    const kind = probeKind(state, ctx.now, await clickPesaWorkWaiting(ctx));
    if (kind === "wait") {
      ctx.gatewayUp = state?.status === "up";
      return NOTHING;
    }

    const answer = await checkGateway({ reuseToken: kind === "with-work" });
    if (answer.ok && !answer.asked) {
      // A token already in hand: no new evidence, so nothing is recorded.
      ctx.gatewayUp = true;
      return NOTHING;
    }

    const { state: next, change } = await recordGatewayObservation(answer.ok ? { ok: true } : { ok: false, detail: answer.detail }, ctx.now);
    ctx.gatewayUp = next.status === "up";

    if (change === "went-down") {
      await raiseAlert({
        key: "gateway-down",
        urgency: "urgent",
        subject: "ClickPesa is not answering — customers cannot pay",
        body: [
          `Since ${next.since} the site has not been able to reach ClickPesa.`,
          `What ClickPesa said: ${next.detail ?? "nothing"}`,
          "",
          "While this lasts: no customer can pay, and no refund or payout can be sent.",
          "Orders are still taken; each customer is emailed a pay link when ClickPesa is back.",
          "Unpaid orders are not cancelled while payment is impossible.",
          "",
          "What to do: sign in to the ClickPesa dashboard and check the account and its API application.",
          "If you cannot sign in, write to support@clickpesa.com.",
        ].join("\n"),
        href: "/admin/rules",
      });
      return { acted: 1, notes: [`ClickPesa is DOWN: ${next.detail ?? "no answer"}`] };
    }
    if (change === "came-back") {
      await resolveAlertFor("gateway-down", undefined, RULES_ACTOR);
      const lasted = next.lastOutage ? Math.max(1, Math.round((Date.parse(next.lastOutage.until) - Date.parse(next.lastOutage.since)) / 60_000)) : null;
      return { acted: 1, notes: [`ClickPesa is back${lasted ? ` after ${lasted} minutes` : ""}.`] };
    }
    return NOTHING;
  },
};

// ---------------------------------------------------------------------------
// Payments the site was never told about
// ---------------------------------------------------------------------------

/**
 * How stale a payment's last check may be before it is checked again, by how
 * long ago the customer was sent to pay. Pure.
 *
 * Someone who was on the pay page ten minutes ago is probably paying now;
 * someone who left it yesterday probably is not. The webhook is the main road
 * for both -- this is the second road, and it is paced so that it cannot use
 * up the day's allowance on links nobody is going to open.
 */
export function recheckAfterMinutes(ageMs: number): number | null {
  // The first half hour belongs to the pay page, which is open in front of
  // the customer and asks ClickPesa itself every minute.
  if (ageMs < 30 * 60_000) return null;
  if (ageMs < 3 * HOUR_MS) return 120;
  if (ageMs < UNPAID.cancelAfterHours * HOUR_MS) return 360;
  // Older than the cancellation deadline: the cancel rule checks it itself,
  // once, at the moment it matters.
  return null;
}

/**
 * Unpaid pay links whose next look is due, least recently checked first.
 * About five looks in an order's day, the cancel rule's last one included --
 * few enough that a handful of abandoned orders cannot use up the allowance.
 */
export async function paymentsDueForRecheck(now: Date): Promise<{ id: string; reference: string }[]> {
  const open = await getPrisma().orderPayment.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      initiatedAt: { gte: new Date(now.getTime() - UNPAID.cancelAfterHours * HOUR_MS) },
      order: { status: { in: ["pending", "confirmed"] } },
    },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { initiatedAt: "desc" }],
    take: 50,
    select: { id: true, initiatedAt: true, lastCheckedAt: true, order: { select: { reference: true } } },
  });
  return open
    .filter((p) => {
      const every = recheckAfterMinutes(now.getTime() - p.initiatedAt.getTime());
      if (every == null) return false;
      return !p.lastCheckedAt || now.getTime() - p.lastCheckedAt.getTime() >= every * 60_000;
    })
    .map((p) => ({ id: p.id, reference: p.order.reference }));
}

export const paymentRecheck: Rule = {
  key: "payment-recheck",
  group: "payments",
  title: "Ask ClickPesa about unpaid orders",
  when: "An order has a pay link, no payment recorded, and has not been checked recently.",
  then: "The site asks ClickPesa directly whether it was paid, instead of waiting to be told. A payment found this way is recorded exactly like any other.",
  needsGateway: true,
  async run(ctx) {
    const due = await paymentsDueForRecheck(ctx.now);

    const notes: string[] = [];
    // Three at most, and always leaving two calls for a refund or payout later in the pass.
    for (const payment of due.slice(0, 3)) {
      if (ctx.callsLeft() <= 2 || ctx.timeLeftMs() < 15_000) break;
      const result = await reconcilePayment(payment.id);
      if (result?.outcome === "captured") notes.push(`Found a payment for ${payment.reference} that the site had not been told about.`);
    }
    return { acted: notes.length, notes };
  },
};

// ---------------------------------------------------------------------------
// Orders that never got a pay link
// ---------------------------------------------------------------------------

const RETRY_CHECKOUT_EVERY_HOURS = 3;

export const checkoutOpen: Rule = {
  key: "checkout-open",
  group: "payments",
  title: "Give a pay link to orders that missed one",
  when: "An order was placed while ClickPesa was not answering, so the customer was never given a way to pay.",
  then: "As soon as ClickPesa answers, the pay link is made and the customer is emailed it. Once per order.",
  needsGateway: true,
  async run(ctx) {
    const waiting = await getPrisma().order.findMany({
      where: {
        status: "pending",
        customerId: { not: null },
        // Priced, and yet no checkout: the link could not be made when it was
        // placed. An order that cannot be priced waits for the shop instead.
        quoteOrderTotalTZS: { not: null },
        payments: { none: {} },
        createdAt: { gte: new Date(ctx.now.getTime() - UNPAID.remindWithinDays * 24 * HOUR_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_PER_RULE,
      select: { id: true, reference: true, productName: true, customerFullName: true, customerEmail: true, quoteOrderTotalTZS: true },
    });

    const notes: string[] = [];
    // A link that cannot be made is tried again every few hours, not every
    // pass: one order ClickPesa keeps refusing must not cost a request a pass.
    const attempt = Math.floor(ctx.now.getTime() / (RETRY_CHECKOUT_EVERY_HOURS * HOUR_MS));
    for (const order of waiting) {
      if (ctx.callsLeft() <= 2 || ctx.timeLeftMs() < 15_000) break;
      if (!(await claimOnce("checkout-open-try", `${order.id}:${attempt}`, ctx.now))) continue;
      const opened = await openCheckout(order.id, { notify: false });
      if (!opened.ok) {
        await logServerError("rule-checkout-open", new Error(`Could not open the checkout for ${order.reference}: ${opened.reason}`));
        // If one link cannot be made, the next will fail the same way.
        break;
      }
      if (opened.reused || !(await claimOnce("checkout-open", order.id, ctx.now))) continue;

      const { subject, body } = checkoutOpenMessage({
        firstName: order.customerFullName.trim().split(/\s+/)[0] || null,
        reference: order.reference,
        productName: order.productName,
        totalTZS: order.quoteOrderTotalTZS!,
        siteUrl: resolveSiteUrl(ctx.env),
      });
      const sent = await sendCustomerEmail(order.customerEmail, subject, body, ctx.env);
      if (!sent.sent && sent.reason !== "no-address" && sent.reason !== "not-configured") {
        await logServerError("rule-checkout-open", new Error(`Could not email the pay link for ${order.reference}: ${sent.reason}`));
      }
      notes.push(`Made the pay link for ${order.reference} and emailed the customer.`);
    }
    return { acted: notes.length, notes };
  },
};
