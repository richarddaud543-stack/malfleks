import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { eatDayStart } from "@/server/money/auto-payouts";
import { RULES_ACTOR } from "@/server/orders/status";
import { clickPesaCallCount } from "@/server/payments/clickpesa";
import { raiseAlert, resolveAlertFor } from "./alerts";
import { RULEBOOK } from "./rulebook";
import { readRulebookSettings } from "./settings";
import { DEFAULT_API_DAILY_BUDGET, HOUR_MS, MAX_CALLS_PER_PASS } from "./thresholds";
import type { Rule, RuleContext, RuleOutcome, RuleTrigger } from "./types";

/**
 * One pass through the rulebook.
 *
 * ## What the owner asked for (10 Oct 2026)
 *
 * "A robust system ... conditions, and execution if conditions are met or
 * unmet. The aim is to make it work when I am not around." Before this, the
 * site had one scheduled job a day that *listed* what was stuck and waited
 * for a person. This is the part that acts.
 *
 * ## What "robust" is made of here
 *
 * - **One rule cannot stop another.** Each runs in its own `try`. A rule that
 *   throws is logged, the owner is told once, and the rest of the pass goes on.
 * - **A pass always leaves a record.** One `RuleRun` row per pass, written in
 *   a `finally`, including a pass in which everything failed. A gap in those
 *   rows is how a stopped clock is seen (`clock-watch`), so a missing row must
 *   only ever mean "no pass happened".
 * - **Two passes never run at once.** A timer that fires twice, or a slow pass
 *   overlapping the next, is turned away by a lease held in the database.
 *   Every rule is also safe on its own against a double run (guarded writes,
 *   once-only marks); the lease is the second lock, not the only one.
 * - **Every pass is safe to repeat.** Nothing depends on the schedule being
 *   exact. Run it twice in a minute or once in a week and each rule does what
 *   is due and no more.
 * - **It stays inside its budget.** ClickPesa allows a fixed number of
 *   requests a day and the platform cuts a request off after a minute. The
 *   pass counts both, and rules stop starting new work when either runs low.
 * - **It can be stopped.** Paused as a whole or one rule at a time, from the
 *   Rules page, without a deploy -- and pausing never stops it *watching*.
 *
 * ## What it is not
 *
 * It is not a workflow engine and holds no state of its own between passes.
 * Every rule reads the database, decides, and writes the database. That is
 * deliberate: the only state that survives a crash is the state that was
 * never anywhere else.
 */

type Env = Record<string, string | undefined>;

/** How long one pass may take before it stops starting new work. The platform's limit is 60 s. */
const PASS_BUDGET_MS = 45_000;
/** How long the lease is held if a pass dies without releasing it. Longer than any pass can run. */
const LEASE_MS = 100_000;
const LEASE_KEY = "rulebookLease";

/** Quiet passes (nothing done, nothing failed) are kept this long: enough to prove the clock ran. */
const KEEP_QUIET_RUNS_DAYS = 14;
/** Every pass, and every once-only mark, is dropped after this long. */
const KEEP_EVERYTHING_DAYS = 180;

export interface RulebookRun {
  ok: boolean;
  /** Why the pass did nothing at all, when it did nothing. */
  skipped?: "busy";
  runId: string | null;
  trigger: RuleTrigger;
  acted: number;
  errors: number;
  apiCalls: number;
  outcomes: RuleOutcome[];
  summary: string;
}

function apiDailyBudget(env: Env): number {
  const n = Number(env.RULES_API_DAILY_BUDGET?.trim());
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_API_DAILY_BUDGET;
}

/**
 * Take the lease, or learn that another pass holds it.
 *
 * The lease is one `AppSetting` row holding the time it expires, as an ISO
 * string -- which sorts the same way the times do. Taking it is a single
 * guarded write ("where the stored expiry is already in the past"), so of two
 * passes arriving together exactly one matches a row.
 */
async function takeLease(now: Date): Promise<boolean> {
  const db = getPrisma();
  await db.appSetting.createMany({ data: [{ key: LEASE_KEY, value: "", updatedBy: RULES_ACTOR }], skipDuplicates: true });
  const { count } = await db.appSetting.updateMany({
    where: { key: LEASE_KEY, value: { lt: now.toISOString() } },
    data: { value: new Date(now.getTime() + LEASE_MS).toISOString(), updatedBy: RULES_ACTOR },
  });
  return count === 1;
}

async function releaseLease(): Promise<void> {
  try {
    await getPrisma().appSetting.updateMany({ where: { key: LEASE_KEY }, data: { value: "" } });
  } catch {
    // It expires by itself.
  }
}

function summarise(outcomes: RuleOutcome[]): string {
  const notes = outcomes.flatMap((o) => o.notes);
  const failed = outcomes.filter((o) => o.error).map((o) => o.key);
  const parts = [...notes];
  if (failed.length > 0) parts.push(`Failed: ${failed.join(", ")}.`);
  return (parts.length > 0 ? parts.join(" ") : "Nothing needed doing.").slice(0, 1000);
}

async function tidy(now: Date): Promise<void> {
  const db = getPrisma();
  await db.ruleRun.deleteMany({ where: { acted: 0, errors: 0, startedAt: { lt: new Date(now.getTime() - KEEP_QUIET_RUNS_DAYS * 24 * HOUR_MS) } } });
  const old = new Date(now.getTime() - KEEP_EVERYTHING_DAYS * 24 * HOUR_MS);
  await db.ruleRun.deleteMany({ where: { startedAt: { lt: old } } });
  await db.ruleMark.deleteMany({ where: { createdAt: { lt: old } } });
}

/**
 * Run every rule once. Never throws.
 *
 * `rules` is for tests; everything else runs the whole `RULEBOOK`.
 */
export async function runRulebook(
  trigger: RuleTrigger,
  options: { now?: Date; env?: Env; rules?: readonly Rule[] } = {},
): Promise<RulebookRun> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const rules = options.rules ?? RULEBOOK;
  const startedAt = new Date();
  const outcomes: RuleOutcome[] = [];
  const empty = (skipped?: "busy"): RulebookRun => ({ ok: false, skipped, runId: null, trigger, acted: 0, errors: 0, apiCalls: 0, outcomes, summary: "" });

  try {
    if (!(await takeLease(now))) return { ...empty("busy"), ok: true, summary: "Another pass is running." };
  } catch (error) {
    await logServerError("rulebook-lease", error);
    return empty();
  }

  const callsAtStart = clickPesaCallCount();
  let runId: string | null = null;
  try {
    const db = getPrisma();
    const [settings, spentToday] = await Promise.all([
      readRulebookSettings(),
      db.ruleRun.aggregate({ where: { startedAt: { gte: eatDayStart(now) } }, _sum: { apiCalls: true } }),
    ]);
    const budgetLeftToday = Math.max(0, apiDailyBudget(env) - (spentToday._sum.apiCalls ?? 0));

    const ctx: RuleContext = {
      now,
      trigger,
      // Until `gateway-watch` (the first rule) says otherwise.
      gatewayUp: false,
      callsLeft: () => {
        const used = clickPesaCallCount() - callsAtStart;
        return Math.max(0, Math.min(MAX_CALLS_PER_PASS - used, budgetLeftToday - used));
      },
      timeLeftMs: () => PASS_BUDGET_MS - (Date.now() - startedAt.getTime()),
      moneySent: false,
      env,
    };

    for (const rule of rules) {
      const outcome: RuleOutcome = { key: rule.key, acted: 0, notes: [] };
      outcomes.push(outcome);
      if (settings.off.has(rule.key)) outcome.skipped = "off";
      else if (settings.paused && !rule.alwaysRuns) outcome.skipped = "paused";
      else if (rule.needsGateway && !ctx.gatewayUp) outcome.skipped = "no-gateway";
      else if (ctx.timeLeftMs() < 5_000) outcome.skipped = "out-of-time";
      if (outcome.skipped) continue;

      try {
        const result = await rule.run(ctx);
        outcome.acted = result.acted;
        outcome.notes = result.notes.map((n) => n.slice(0, 300)).slice(0, 20);
      } catch (error) {
        outcome.error = (error instanceof Error ? error.message : String(error)).slice(0, 500);
        await logServerError(`rule-${rule.key}`, error);
      }
    }

    // A rule that threw: tell the owner once per rule, and take the alarm
    // down the next time that rule gets through a pass cleanly.
    const failing = outcomes.filter((o) => o.error);
    for (const failed of failing) {
      const rule = rules.find((r) => r.key === failed.key);
      await raiseAlert(
        {
          key: "rule-failed",
          subjectId: failed.key,
          urgency: rule?.movesMoney ? "urgent" : "routine",
          subject: `The rule "${rule?.title ?? failed.key}" is failing`,
          body: [
            `The rule "${rule?.title ?? failed.key}" stopped with an error and did nothing this pass:`,
            failed.error ?? "",
            "",
            "The other rules ran normally. It is tried again on every pass and this alert closes itself when it works.",
            "If it stays open, it is a fault in the site that needs fixing.",
          ].join("\n"),
          href: "/admin/rules",
        },
        env,
      );
    }
    const openFailures = await db.ownerAlert.findMany({ where: { key: "rule-failed", openKey: { not: null } }, select: { openKey: true } });
    for (const alert of openFailures) {
      const key = (alert.openKey ?? "").slice("rule-failed:".length);
      const outcome = outcomes.find((o) => o.key === key);
      if (outcome && !outcome.error && !outcome.skipped) await resolveAlertFor("rule-failed", key, RULES_ACTOR);
    }
  } catch (error) {
    // Something outside any rule: settings could not be read, the database
    // dropped. Recorded as a failed pass below.
    outcomes.push({ key: "engine", acted: 0, notes: [], error: (error instanceof Error ? error.message : String(error)).slice(0, 500) });
    await logServerError("rulebook", error);
  } finally {
    const acted = outcomes.reduce((sum, o) => sum + o.acted, 0);
    const errors = outcomes.filter((o) => o.error).length;
    try {
      const row = await getPrisma().ruleRun.create({
        data: {
          trigger,
          startedAt: now,
          finishedAt: new Date(now.getTime() + (Date.now() - startedAt.getTime())),
          apiCalls: clickPesaCallCount() - callsAtStart,
          acted,
          errors,
          summary: summarise(outcomes),
          results: outcomes as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      runId = row.id;
      await tidy(now);
    } catch (error) {
      await logServerError("rulebook-record", error);
    }
    await releaseLease();
  }

  const acted = outcomes.reduce((sum, o) => sum + o.acted, 0);
  const errors = outcomes.filter((o) => o.error).length;
  return { ok: errors === 0, runId, trigger, acted, errors, apiCalls: clickPesaCallCount() - callsAtStart, outcomes, summary: summarise(outcomes) };
}

// ---------------------------------------------------------------------------
// Reading the record, for the Rules page
// ---------------------------------------------------------------------------

export interface RunRow {
  id: string;
  trigger: string;
  startedAt: Date;
  acted: number;
  errors: number;
  apiCalls: number;
  summary: string;
}

export interface ClockStatus {
  /** The last pass the outside timer started, or null if it never has. */
  lastTimerAt: Date | null;
  /** The last pass of any kind. */
  lastRunAt: Date | null;
  /** Timer passes in the last 24 hours. 96 when the timer is healthy. */
  timerPassesToday: number;
  /** ClickPesa requests the rules have made since midnight in Dar es Salaam, and the day's allowance for them. */
  apiCallsToday: number;
  apiDailyBudget: number;
}

export async function clockStatus(now: Date = new Date(), env: Env = process.env): Promise<ClockStatus> {
  const db = getPrisma();
  const [lastTimer, lastRun, passes, calls] = await Promise.all([
    db.ruleRun.findFirst({ where: { trigger: "timer" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    db.ruleRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    db.ruleRun.count({ where: { trigger: "timer", startedAt: { gte: new Date(now.getTime() - 24 * HOUR_MS) } } }),
    db.ruleRun.aggregate({ where: { startedAt: { gte: eatDayStart(now) } }, _sum: { apiCalls: true } }),
  ]);
  return {
    lastTimerAt: lastTimer?.startedAt ?? null,
    lastRunAt: lastRun?.startedAt ?? null,
    timerPassesToday: passes,
    apiCallsToday: calls._sum.apiCalls ?? 0,
    apiDailyBudget: apiDailyBudget(env),
  };
}

/** Passes in which something was done or something failed, newest first. */
export async function recentActivity(limit = 30): Promise<RunRow[]> {
  return getPrisma().ruleRun.findMany({
    where: { OR: [{ acted: { gt: 0 } }, { errors: { gt: 0 } }] },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, trigger: true, startedAt: true, acted: true, errors: true, apiCalls: true, summary: true },
  });
}
