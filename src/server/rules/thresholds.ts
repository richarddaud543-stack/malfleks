/**
 * Every number the rulebook waits for, in one place.
 *
 * These are the owner's policy (his answers of 10 Oct 2026), not engineering
 * constants: change one here and the rule, its wording on the Rules page and
 * the emails that quote it all follow, because they read it from here.
 */

export const HOUR_MS = 3_600_000;

export const UNPAID = {
  /** After this long without payment the customer gets one reminder. */
  remindAfterHours: 1,
  /** After this long without payment the order is cancelled. */
  cancelAfterHours: 24,
  /**
   * An order is never cancelled less than this long after its reminder went
   * out. It is what stops the first pass after a deploy (or after a long
   * outage) from cancelling a pile of old orders nobody was warned about.
   */
  minHoursAfterReminder: 12,
  /** No reminder is sent for an order older than this; it is simply cancelled. */
  remindWithinDays: 7,
} as const;

export const UNDELIVERED = {
  /** Paid, not delivered: the shop (and courier) are reminded once. */
  remindPartnerAfterHours: 24,
  /** The owner is told. */
  alertOwnerAfterHours: 72,
  /** The shop gets a last warning naming the hour the order will be cancelled. */
  finalWarningAfterHours: 96,
  /** The order is cancelled and the customer refunded in full. */
  cancelAfterHours: 120,
  /** Never cancelled less than this long after the last warning went out. */
  minHoursAfterFinalWarning: 24,
} as const;

export const SHOP_RELIABILITY = {
  /** Paid orders a shop failed (declined after payment, or missed the deadline)... */
  failures: 3,
  /** ...within this many days, before its listings are taken off the shop. */
  windowDays: 30,
} as const;

/** The most things one rule does in one pass. Keeps a pass short and a first run from sending fifty emails at once. */
export const MAX_PER_RULE = 10;

/**
 * ClickPesa requests the rulebook may make in a day, out of the account's 100
 * (before it is verified). The rest is left for customers getting pay links
 * and checking their own payments. `RULES_API_DAILY_BUDGET` overrides it.
 */
export const DEFAULT_API_DAILY_BUDGET = 60;

/** The most ClickPesa requests one pass may make. */
export const MAX_CALLS_PER_PASS = 8;

/** A timer that has not called in this long is treated as stopped. Four missed calls. */
export const CLOCK_STOPPED_AFTER_MINUTES = 60;
