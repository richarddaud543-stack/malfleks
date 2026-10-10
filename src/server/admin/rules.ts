import { resolveAdminUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { autoPayoutStatus, type AutoPayoutStatus } from "@/server/money/auto-payouts";
import { isSmsConfigured } from "@/server/notify/sms";
import { toSmsNumber } from "@/server/notify/sms";
import { isFreshlyDown, readGatewayState, type GatewayState } from "@/server/payments/gateway-state";
import { openAlerts, recentlyResolvedAlerts, type AlertRow } from "@/server/rules/alerts";
import { clockStatus, recentActivity, type ClockStatus, type RunRow } from "@/server/rules/engine";
import { GROUP_TITLES, RULEBOOK } from "@/server/rules/rulebook";
import { readRulebookSettings } from "@/server/rules/settings";
import { CLOCK_STOPPED_AFTER_MINUTES } from "@/server/rules/thresholds";
import type { RuleGroup, RuleOutcome } from "@/server/rules/types";

/**
 * Everything the Rules page shows, in one read.
 *
 * The page is a view: it runs no rule and decides nothing. If it were deleted
 * the rulebook would go on exactly as before.
 */

export interface RuleRow {
  key: string;
  title: string;
  when: string;
  then: string;
  movesMoney: boolean;
  alwaysRuns: boolean;
  off: boolean;
  /** What it did the last time a pass ran, or null if no pass has. */
  last: RuleOutcome | null;
}

export interface RulesPage {
  now: Date;
  paused: boolean;
  clock: ClockStatus & { state: "running" | "stopped" | "never" };
  gateway: { state: GatewayState | null; down: boolean };
  money: AutoPayoutStatus;
  /** Whether an urgent alert can also reach the owner's phone, and why not when it cannot. */
  texting: "ready" | "no-provider" | "no-number";
  alerts: (AlertRow & { refundRetryOrderId: string | null })[];
  resolved: AlertRow[];
  groups: { group: RuleGroup; title: string; rules: RuleRow[] }[];
  activity: RunRow[];
  /** The address the outside timer must call. Never includes the secret. */
  timerUrl: string;
  cronSecretSet: boolean;
}

function asOutcomes(value: unknown): RuleOutcome[] {
  return Array.isArray(value) ? (value.filter((o) => o && typeof o === "object" && typeof (o as RuleOutcome).key === "string") as RuleOutcome[]) : [];
}

export async function readRulesPage(now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<RulesPage> {
  const db = getPrisma();
  const [settings, clock, state, money, alerts, resolved, activity, lastRun] = await Promise.all([
    readRulebookSettings(),
    clockStatus(now, env),
    readGatewayState(),
    autoPayoutStatus(now, env),
    openAlerts(),
    recentlyResolvedAlerts(8),
    recentActivity(30),
    db.ruleRun.findFirst({ orderBy: { startedAt: "desc" }, select: { results: true } }),
  ]);
  const last = new Map(asOutcomes(lastRun?.results).map((o) => [o.key, o]));

  // Which refund alerts can offer "try again": only where the refund never left.
  const refundOrderIds = alerts.filter((a) => a.key === "refund-needs-owner" && a.href?.startsWith("/admin/orders/")).map((a) => a.href!.slice("/admin/orders/".length));
  const retryable = new Set(
    refundOrderIds.length > 0
      ? (await db.refundSend.findMany({ where: { orderId: { in: refundOrderIds }, status: "failed", sendStartedAt: null }, select: { orderId: true } })).map((r) => r.orderId)
      : [],
  );

  const silentMinutes = clock.lastTimerAt ? (now.getTime() - clock.lastTimerAt.getTime()) / 60_000 : null;
  const groups = (Object.keys(GROUP_TITLES) as RuleGroup[]).map((group) => ({
    group,
    title: GROUP_TITLES[group],
    rules: RULEBOOK.filter((r) => r.group === group).map(
      (r): RuleRow => ({
        key: r.key,
        title: r.title,
        when: r.when,
        then: r.then,
        movesMoney: Boolean(r.movesMoney),
        alwaysRuns: Boolean(r.alwaysRuns),
        off: settings.off.has(r.key),
        last: last.get(r.key) ?? null,
      }),
    ),
  }));

  return {
    now,
    paused: settings.paused,
    clock: { ...clock, state: silentMinutes == null ? "never" : silentMinutes > CLOCK_STOPPED_AFTER_MINUTES ? "stopped" : "running" },
    gateway: { state, down: isFreshlyDown(state, now) },
    money,
    texting: !isSmsConfigured(env) ? "no-provider" : toSmsNumber(env.MALFLEKS_OWNER_PHONE) ? "ready" : "no-number",
    alerts: alerts.map((a) => {
      const orderId = a.key === "refund-needs-owner" && a.href?.startsWith("/admin/orders/") ? a.href.slice("/admin/orders/".length) : null;
      return { ...a, refundRetryOrderId: orderId && retryable.has(orderId) ? orderId : null };
    }),
    resolved,
    groups: groups.filter((g) => g.rules.length > 0),
    activity,
    timerUrl: `${resolveAdminUrl(env)}/api/rules/run`,
    cronSecretSet: Boolean(env.CRON_SECRET?.trim()),
  };
}
