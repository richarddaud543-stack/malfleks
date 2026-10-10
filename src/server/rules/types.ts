/**
 * The shapes the rulebook is built from. See `engine.ts` for how a pass runs
 * and `rulebook.ts` for the rules themselves.
 */

/** What started a pass: the fifteen-minute timer, the daily job, or an admin pressing "Run now". */
export type RuleTrigger = "timer" | "daily" | "manual";

export type RuleGroup = "payments" | "orders" | "money" | "shops" | "owner";

/** What a rule may know about the pass it is running in. */
export interface RuleContext {
  now: Date;
  trigger: RuleTrigger;
  /**
   * Whether ClickPesa answered at the start of this pass. `false` means it did
   * not, or was not asked because the day's allowance is spent -- either way a
   * rule that needs ClickPesa must do nothing.
   */
  gatewayUp: boolean;
  /** How many more ClickPesa requests this pass may make. Read it before each one. */
  callsLeft(): number;
  /** Milliseconds before the pass must stop starting new work (the platform cuts a request off at 60 s). */
  timeLeftMs(): number;
  /**
   * Set by a rule that has just asked ClickPesa to send money. ClickPesa
   * accepts one such request a minute, so the next money rule in the same
   * pass sees this and waits for the next pass.
   */
  moneySent: boolean;
  env: Record<string, string | undefined>;
}

export interface RuleResult {
  /** How many things the rule changed or sent. Zero is the normal answer. */
  acted: number;
  /** One short line per thing done, for the activity list. English; the owner reads it. */
  notes: string[];
}

export interface Rule {
  /** Stable for ever: it is stored in `RuleMark`, in settings and in every recorded pass. */
  key: string;
  group: RuleGroup;
  /** A few words, for a heading. */
  title: string;
  /** The condition, in the owner's words. */
  when: string;
  /** What happens when the condition holds. */
  then: string;
  /** True when the rule cannot do anything useful without ClickPesa. */
  needsGateway?: boolean;
  /** True when the rule moves money. Such a rule also obeys the Payouts page's switch. */
  movesMoney?: boolean;
  /**
   * True for the few rules that keep running while the rulebook is paused:
   * watching ClickPesa, and finishing the record of money already sent.
   * Pausing must never mean "stop finding out what happened".
   */
  alwaysRuns?: boolean;
  run(ctx: RuleContext): Promise<RuleResult>;
}

/** What one rule did in one pass, as stored in `RuleRun.results`. */
export interface RuleOutcome {
  key: string;
  acted: number;
  notes: string[];
  /** Why the rule did not run, when it did not. */
  skipped?: "off" | "paused" | "no-gateway" | "out-of-time";
  /** The error message, when the rule threw. Other rules still ran. */
  error?: string;
}

export const NOTHING: RuleResult = { acted: 0, notes: [] };
