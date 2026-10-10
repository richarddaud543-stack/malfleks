import { getPrisma } from "@/server/db/client";
import { autoPayoutConfig, autoPayoutsPaused, compareBooksWithClickPesa, eatDayStart, runAutoPayouts, settleSendingPayouts } from "@/server/money/auto-payouts";
import { moneyTotals, moneyWork } from "@/server/money/payouts";
import { runAutoRefunds, settleSendingRefunds, REFUND_ACTOR } from "@/server/money/refund-send";
import { raiseAlert, resolveAlertFor } from "../alerts";
import { claimOnce } from "../marks";
import type { Rule } from "../types";

/**
 * The rules that move money, and the ones that check it.
 *
 * Nothing here decides *how* money is sent: `auto-payouts.ts` and
 * `refund-send.ts` hold the never-twice discipline and these rules only call
 * them, in an order that respects ClickPesa's one-payout-a-minute pace --
 * refunds first, because a customer waiting for their own money back comes
 * before a partner waiting to be paid.
 */

function tzs(amount: number): string {
  return `TSh ${amount.toLocaleString("en-US")}`;
}

export const moneyInFlight: Rule = {
  key: "money-in-flight",
  group: "money",
  title: "Find out what became of money already sent",
  when: "A refund or payout has been sent and ClickPesa has not yet said whether it arrived.",
  then: "The site asks. When it arrived the books are updated and the person is told; when it bounced, you are told. This keeps running even while the rules are paused.",
  needsGateway: true,
  alwaysRuns: true,
  async run(ctx) {
    const db = getPrisma();
    const [refunds, payouts] = await Promise.all([db.refundSend.count({ where: { status: "sending" } }), db.payoutBatch.count({ where: { status: "sending" } })]);
    const notes: string[] = [];

    if (refunds > 0 && ctx.callsLeft() > 0) {
      for (const r of await settleSendingRefunds(Math.min(3, ctx.callsLeft()))) {
        notes.push(r.outcome === "sent" ? "A refund arrived; the customer has been told." : "A refund did NOT arrive; you have been told.");
      }
    }
    if (payouts > 0 && ctx.callsLeft() > 0) {
      for (const p of await settleSendingPayouts(Math.min(3, ctx.callsLeft()))) {
        notes.push(p.outcome === "paid" ? "A payout arrived; the partner has been told." : "A payout came back; you have been told.");
      }
    }
    return { acted: notes.length, notes };
  },
};

export const refundSend: Rule = {
  key: "refund-send",
  group: "money",
  title: "Refund a customer in full",
  when: "A paid order was cancelled because the shop declined it, because it missed the delivery deadline, or because the payment arrived after the order was already cancelled.",
  then: "The full amount goes back to the mobile-money number that paid, and the customer is emailed. One at a time, within your limits. An order you cancelled yourself, or a change of mind, still waits for you.",
  needsGateway: true,
  movesMoney: true,
  async run(ctx) {
    // Preview + send, and the answer is usually in the send's own response.
    if (ctx.callsLeft() < 2) return { acted: 0, notes: [] };
    const run = await runAutoRefunds(ctx.now, ctx.env, { settleInFlight: false });
    const notes: string[] = [];
    if (run.sent) {
      ctx.moneySent = ctx.moneySent || run.sent.result === "sent" || run.sent.result === "sending" || run.sent.result === "unknown";
      if (run.sent.result === "sent") notes.push(`Refunded ${tzs(run.sent.amountTZS)} for ${run.sent.reference}.`);
      else if (run.sent.result === "sending" || run.sent.result === "unknown") notes.push(`Sent a refund of ${tzs(run.sent.amountTZS)} for ${run.sent.reference}; waiting for ClickPesa to confirm it.`);
      else if (run.sent.result === "refused") notes.push(`Could not refund ${run.sent.reference}: ${run.sent.detail ?? "ClickPesa refused"}. You have been told.`);
    }
    for (const left of run.leftForOwner) notes.push(`${left.reference} needs you to send its refund (${left.reason}).`);

    // A refund alert whose order no longer holds any money was settled by
    // hand. Close it.
    const open = await getPrisma().ownerAlert.findMany({
      where: { key: "refund-needs-owner", status: { in: ["open", "handling"] }, openKey: { not: null } },
      select: { openKey: true },
      take: 50,
    });
    if (open.length > 0) {
      const due = new Set((await moneyWork()).refundsDue.map((r) => r.orderId));
      for (const alert of open) {
        const orderId = (alert.openKey ?? "").slice("refund-needs-owner:".length);
        if (orderId && !due.has(orderId)) await resolveAlertFor("refund-needs-owner", orderId, REFUND_ACTOR);
      }
    }
    return { acted: notes.length, notes };
  },
};

export const payoutSend: Rule = {
  key: "payout-send",
  group: "money",
  title: "Pay the shop and courier after delivery",
  when: "An order was delivered (the customer's code was entered) and the shop or courier has not been paid their share yet.",
  then: "Their share is sent to their mobile-money number and they are emailed. One at a time, within your limits. This is the catch-up for the payment that normally goes the moment the code is entered.",
  needsGateway: true,
  movesMoney: true,
  async run(ctx) {
    // A refund went out this pass: ClickPesa takes one payout a minute.
    if (ctx.moneySent || ctx.callsLeft() < 2) return { acted: 0, notes: [] };
    const run = await runAutoPayouts(ctx.now, ctx.env, { settleInFlight: false });
    const notes: string[] = [];
    if (run.sent) {
      ctx.moneySent = ctx.moneySent || run.sent.result === "paid" || run.sent.result === "sending" || run.sent.result === "unknown";
      if (run.sent.result === "paid") notes.push(`Paid ${run.sent.payee} ${tzs(run.sent.amountTZS)}.`);
      else if (run.sent.result === "sending" || run.sent.result === "unknown") notes.push(`Sent ${run.sent.payee} ${tzs(run.sent.amountTZS)}; waiting for ClickPesa to confirm it.`);
      else notes.push(`Could not pay ${run.sent.payee}: ${run.sent.detail ?? run.sent.result}.`);
    }

    // Partners the site cannot pay by itself: say so once per partner per
    // reason, not on every pass.
    for (const left of run.leftForAdmin) {
      // These three sort themselves out: tomorrow, or when more is owed.
      if (left.reason === "recently-failed" || left.reason === "daily-ceiling" || left.reason === "below-minimum") continue;
      const why = left.reason === "no-mobile-number" ? "there is no mobile-money number on file for them" : "it is more than the largest amount MalFleks may send by itself";
      await raiseAlert(
        {
          key: "payout-needs-owner",
          subjectId: `${left.payee}:${left.reason}`,
          urgency: "routine",
          subject: `${left.payee} is owed ${tzs(left.amountTZS)} and cannot be paid automatically`,
          body: [`${left.payee} is owed ${tzs(left.amountTZS)}, and MalFleks cannot send it because ${why}.`, "", "Send it from the Payouts page:"].join("\n"),
          href: "/admin/payouts",
        },
        ctx.env,
      );
    }
    return { acted: notes.length, notes };
  },
};

export const booksCheck: Rule = {
  key: "books-check",
  group: "money",
  title: "Check ClickPesa holds what is owed",
  when: "Once a day: ClickPesa's balance is less than what MalFleks owes partners and customers.",
  then: "Sending money is paused and you are told at once. Nothing is un-paused automatically.",
  needsGateway: true,
  async run(ctx) {
    // Once a day, after 07:00 in Dar es Salaam, and only while money sending
    // is on -- with it off, nothing here leaves without you and the Money
    // page shows the same comparison when you open it.
    if (!autoPayoutConfig(ctx.env).armed) return { acted: 0, notes: [] };
    const day = eatDayStart(ctx.now);
    if (ctx.now.getTime() - day.getTime() < 7 * 3_600_000) return { acted: 0, notes: [] };
    if (ctx.callsLeft() < 1) return { acted: 0, notes: [] };
    if (!(await claimOnce("books-check", day.toISOString().slice(0, 10), ctx.now))) return { acted: 0, notes: [] };

    const [check, totals, work] = await Promise.all([compareBooksWithClickPesa(), moneyTotals(), moneyWork()]);
    if (!check.ok) return { acted: 0, notes: [`Could not read ClickPesa's balance: ${check.reason}`] };

    const refundsDue = work.refundsDue.reduce((sum, r) => sum + r.refundableTZS, 0);
    const owedToOthers = totals.owedTZS + totals.inPayoutsTZS + refundsDue;
    if (check.clickpesaTZS >= owedToOthers) {
      await resolveAlertFor("books-short", undefined, "system:rules");
      return { acted: 0, notes: [] };
    }

    const alreadyPaused = await autoPayoutsPaused();
    if (!alreadyPaused) {
      const { setAutoPayoutsPaused } = await import("@/server/money/auto-payouts");
      await setAutoPayoutsPaused(true, "system:rules");
    }
    await raiseAlert(
      {
        key: "books-short",
        urgency: "urgent",
        subject: `ClickPesa holds ${tzs(Math.round(check.clickpesaTZS))} but ${tzs(owedToOthers)} is owed`,
        body: [
          `ClickPesa's balance is ${tzs(Math.round(check.clickpesaTZS))}.`,
          `MalFleks owes ${tzs(owedToOthers)}: ${tzs(totals.owedTZS + totals.inPayoutsTZS)} to shops and couriers, ${tzs(refundsDue)} in refunds.`,
          "",
          "There is not enough to pay everyone, so automatic refunds and payouts have been PAUSED.",
          "Find out where the difference went (ClickPesa's fees, a withdrawal, a payment made by hand),",
          "top the account up if needed, then switch sending back on from the Payouts page.",
        ].join("\n"),
        href: "/admin/money",
      },
      ctx.env,
    );
    return { acted: 1, notes: ["ClickPesa holds less than is owed. Money sending is paused and you have been told."] };
  },
};
