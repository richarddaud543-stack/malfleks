import { checkoutOpen, gatewayWatch, paymentRecheck } from "./rules/gateway";
import { booksCheck, moneyInFlight, payoutSend, refundSend } from "./rules/money";
import { deliveryAlert, deliveryCancel, deliveryFinalWarning, deliveryReminder, unpaidCancel, unpaidReminder } from "./rules/orders";
import { clockWatch, dailySummary } from "./rules/owner";
import { shopReliability, shopVerification } from "./rules/shops";
import type { Rule, RuleGroup } from "./types";

/**
 * The rulebook: every condition MalFleks watches for by itself, and what it
 * does when the condition holds.
 *
 * ## Read this file like a list, not like a program
 *
 * Each entry is one rule: a `when` and a `then` in the owner's words (the
 * Rules page prints them as they are written), and a `run` that does exactly
 * that and nothing else. To learn what the site will do while nobody is
 * looking, this is the whole answer -- there is no other place a scheduled
 * decision is made.
 *
 * ## The order matters
 *
 * A pass runs the rules top to bottom:
 *
 * 1. **Find out.** Is ClickPesa answering? What became of money already sent?
 *    What did customers pay that the site was not told about?
 * 2. **Remind and warn.** Everyone who is about to be affected hears first.
 * 3. **Act.** Cancel what has lapsed.
 * 4. **Move money.** Refunds before payouts, one send a pass.
 * 5. **Step back.** Look at the pattern, check the books, tell the owner.
 *
 * Finding out comes first so that no rule acts on stale facts: an order is
 * not cancelled as unpaid in the same pass that would have discovered its
 * payment.
 *
 * ## Adding a rule
 *
 * Write it as a `Rule` beside the others, add it here in the place its kind
 * belongs, and give it a key that will never change -- the key is stored in
 * marks, settings and every recorded pass.
 */
export const RULEBOOK: readonly Rule[] = [
  // 1. Find out.
  gatewayWatch,
  clockWatch,
  moneyInFlight,
  paymentRecheck,
  checkoutOpen,
  // 2. Remind and warn.
  unpaidReminder,
  deliveryReminder,
  deliveryAlert,
  deliveryFinalWarning,
  // 3. Act.
  unpaidCancel,
  deliveryCancel,
  // 4. Move money.
  refundSend,
  payoutSend,
  // 5. Step back.
  shopReliability,
  shopVerification,
  booksCheck,
  dailySummary,
];

export function ruleByKey(key: string): Rule | undefined {
  return RULEBOOK.find((r) => r.key === key);
}

export const GROUP_TITLES: Record<RuleGroup, string> = {
  payments: "Payments",
  orders: "Orders",
  money: "Money",
  shops: "Shops",
  owner: "Keeping you informed",
};
