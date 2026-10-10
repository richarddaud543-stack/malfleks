import { resolveAdminUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { autoPayoutConfig, autoPayoutsPaused, eatDayStart } from "@/server/money/auto-payouts";
import { sendNotification } from "@/server/notify/email";
import { dailySummaryMessage } from "@/server/notify/rule-messages";
import { RULES_ACTOR } from "@/server/orders/status";
import { isFreshlyDown, readGatewayState } from "@/server/payments/gateway-state";
import { openAlerts, raiseAlert, resolveAlertFor } from "../alerts";
import { claimOnce } from "../marks";
import { readRulebookSettings } from "../settings";
import { CLOCK_STOPPED_AFTER_MINUTES, HOUR_MS } from "../thresholds";
import type { Rule } from "../types";

/**
 * The rules whose only job is the owner's peace of mind: one email a morning,
 * and a watch on the clock that runs everything else.
 */

/** The hour, in Dar es Salaam, after which the morning email may go. */
const SUMMARY_HOUR_EAT = 8;

function eatLabel(day: Date): string {
  // `day` is midnight EAT expressed in UTC; shift it so UTC getters read EAT.
  const eat = new Date(day.getTime() + 3 * HOUR_MS);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[eat.getUTCDay()]} ${eat.getUTCDate()} ${months[eat.getUTCMonth()]}`;
}

export const dailySummary: Rule = {
  key: "daily-summary",
  group: "owner",
  title: "Send you a morning summary",
  when: `Every day after ${SUMMARY_HOUR_EAT}:00 in Dar es Salaam.`,
  then: "One email: what the rules did yesterday, whether the clock and ClickPesa are healthy, and what is waiting for you. It is sent on quiet days too, so its absence means something is wrong.",
  async run(ctx) {
    const today = eatDayStart(ctx.now);
    if (ctx.now.getTime() - today.getTime() < SUMMARY_HOUR_EAT * HOUR_MS) return { acted: 0, notes: [] };
    if (!(await claimOnce("daily-summary", today.toISOString().slice(0, 10), ctx.now))) return { acted: 0, notes: [] };

    const db = getPrisma();
    const yesterday = new Date(today.getTime() - 24 * HOUR_MS);
    const during = { gte: yesterday, lt: today };
    const [placed, paid, delivered, cancelledByRules, refunds, payouts, passes, state, paused, settings, alerts] = await Promise.all([
      db.order.count({ where: { createdAt: during } }),
      db.orderPayment.count({ where: { status: "captured", capturedAt: during } }),
      db.orderEvent.count({ where: { toStatus: "fulfilled", createdAt: during } }),
      db.orderEvent.count({ where: { toStatus: "cancelled", actorUid: RULES_ACTOR, createdAt: during } }),
      db.refundSend.aggregate({ where: { status: "sent", finishedAt: during }, _count: { _all: true }, _sum: { amountTZS: true } }),
      db.payoutBatch.aggregate({ where: { status: "paid", sendRef: { not: null }, paidAt: during }, _count: { _all: true }, _sum: { totalTZS: true } }),
      db.ruleRun.count({ where: { trigger: "timer", startedAt: { gte: new Date(ctx.now.getTime() - 24 * HOUR_MS) } } }),
      readGatewayState(),
      autoPayoutsPaused(),
      readRulebookSettings(),
      openAlerts(),
    ]);

    const { subject, body } = dailySummaryMessage({
      day: eatLabel(yesterday),
      ordersPlaced: placed,
      ordersPaid: paid,
      ordersDelivered: delivered,
      cancelledByRules,
      refundsSent: { count: refunds._count._all, totalTZS: refunds._sum.amountTZS ?? 0 },
      payoutsSent: { count: payouts._count._all, totalTZS: payouts._sum.totalTZS ?? 0 },
      clockPasses: passes,
      gateway: !state ? "not known" : isFreshlyDown(state, ctx.now) ? "down" : state.status === "up" ? "up" : "not known",
      moneySending: !autoPayoutConfig(ctx.env).armed ? "off" : paused ? "paused" : "on",
      rulebookPaused: settings.paused,
      openAlerts: alerts.map((a) => ({ subject: a.subject, urgency: a.urgency, handling: a.status === "handling" })),
      adminUrl: resolveAdminUrl(ctx.env),
    });
    const sent = await sendNotification(subject, body, ctx.env);
    if (!sent.sent && sent.reason !== "not-configured") {
      await logServerError("rule-daily-summary", new Error(`Could not email the daily summary: ${sent.reason}`));
    }
    return { acted: 1, notes: ["Sent you the morning summary."] };
  },
};

export const clockWatch: Rule = {
  key: "clock-watch",
  group: "owner",
  title: "Notice if the 15-minute clock stops",
  when: `The daily job runs and finds the 15-minute timer has not called for over ${CLOCK_STOPPED_AFTER_MINUTES} minutes.`,
  then: "You are emailed and texted. Until it is fixed the rules still run once a day, so nothing is lost -- only slower.",
  alwaysRuns: true,
  async run(ctx) {
    // The timer cannot report its own death; only a different clock can. So
    // this does its checking on the daily job (Vercel's scheduler) and on a
    // manual run, and on a timer pass it only clears the alarm.
    if (ctx.trigger === "timer") {
      const cleared = (await resolveAlertFor("clock-stopped", undefined, RULES_ACTOR)) || (await resolveAlertFor("clock-not-set-up", undefined, RULES_ACTOR));
      return cleared ? { acted: 1, notes: ["The 15-minute clock is running again."] } : { acted: 0, notes: [] };
    }

    const last = await getPrisma().ruleRun.findFirst({ where: { trigger: "timer" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
    if (!last) {
      const { raised } = await raiseAlert(
        {
          key: "clock-not-set-up",
          urgency: "routine",
          subject: "The 15-minute timer is not set up yet",
          body: [
            "The rules are meant to run every 15 minutes, called by a free outside timer.",
            "No such call has ever arrived, so for now they run once a day (with the daily payment check).",
            "",
            "The Rules page has the address and the three steps to set the timer up.",
          ].join("\n"),
          href: "/admin/rules",
        },
        ctx.env,
      );
      return raised ? { acted: 1, notes: ["Told you the 15-minute timer has not been set up."] } : { acted: 0, notes: [] };
    }

    const silentMinutes = Math.floor((ctx.now.getTime() - last.startedAt.getTime()) / 60_000);
    if (silentMinutes <= CLOCK_STOPPED_AFTER_MINUTES) return { acted: 0, notes: [] };
    const { raised } = await raiseAlert(
      {
        key: "clock-stopped",
        urgency: "urgent",
        subject: "The 15-minute clock has stopped",
        body: [
          `The outside timer last called the site ${silentMinutes >= 120 ? `${Math.floor(silentMinutes / 60)} hours` : `${silentMinutes} minutes`} ago. It should call every 15 minutes.`,
          "",
          "Until it is fixed the rules run once a day only: reminders, cancellations, refunds and payouts all happen, but late.",
          "",
          "What to do: sign in to the timer service and check the job is still enabled and has not been switched off after failures.",
          "The Rules page shows the address it should be calling.",
        ].join("\n"),
        href: "/admin/rules",
      },
      ctx.env,
    );
    return raised ? { acted: 1, notes: ["The 15-minute clock has stopped. You have been told."] } : { acted: 0, notes: [] };
  },
};
