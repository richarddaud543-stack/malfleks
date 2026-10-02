import { resolveAdminUrl, resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import {
  branchOrderReminderMessage,
  sendNotification,
  sendPartnerEmail,
  stuckOrdersDigestMessage,
  type StuckOrderLine,
} from "@/server/notify/email";
import { partnerContact } from "@/server/notify/events";

/**
 * The safety net for orders that have stopped moving.
 *
 * Every step of an order now tells the person who has to take the next one.
 * That is not the same as the step being taken: a branch can ignore an email,
 * a customer can decide not to pay, a courier can deliver and forget to say
 * so. Before this, such an order simply sat -- nothing was wrong enough to
 * raise an error, so nobody looked.
 *
 * Once a day (the cron in `src/app/api/cron/reconcile/route.ts`; the Hobby
 * plan allows daily and no finer) this does two things:
 *
 *  1. Sends MalFleks's own inbox **one** email listing what is stuck, in three
 *     groups. No email on a day with nothing to list.
 *  2. Sends the branch **one** reminder for an order it has not answered in a
 *     day -- once per order, ever, recorded in `Order.branchRemindedAt`.
 *
 * ## What it deliberately does not do
 *
 * It cancels nothing and changes no order's status. Whether a pending order
 * should lapse after some number of days, or an unpaid one be released, is a
 * policy decision the owner has not made, and a job that quietly cancelled
 * orders would be making it for him. This only makes sure a person sees them.
 */

const HOUR_MS = 60 * 60_000;

/** How long each kind of waiting is allowed before it is called stuck. */
export const STUCK_AFTER_HOURS = {
  /** Pending, the branch has not confirmed or declined. */
  undecided: 24,
  /** Confirmed, and the customer has not paid. */
  unpaid: 48,
  /** Paid, and nobody has marked it delivered. */
  undelivered: 72,
} as const;

/**
 * A branch is not reminded about an order older than this. The first run
 * after this shipped would otherwise email every branch about every stale
 * order in the table's history; those belong in the admin's digest, where a
 * person decides what to do with them, not in a partner's inbox.
 */
const REMIND_WITHIN_DAYS = 7;

/** Enough for one email to stay readable; the admin list has the rest. */
const MAX_LINES = 50;

export interface StuckOrders {
  undecided: StuckOrderLine[];
  unpaid: StuckOrderLine[];
  undelivered: StuckOrderLine[];
}

function hoursSince(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / HOUR_MS));
}

/**
 * The three lists, oldest first. Read-only and takes `now`, so the rule for
 * each list can be tested against a real database without waiting three days.
 *
 * - **undecided** counts from when the order was placed.
 * - **unpaid** is an order with a checkout nobody has paid: counted from when
 *   it was placed if the checkout opened then (the normal case since 3 Oct
 *   2026), or from when it was confirmed (`decidedAt`) on the old path.
 * - **undelivered** counts from when the payment was captured. A confirmed
 *   order with a captured payment is, by definition, paid and not yet marked
 *   delivered -- `fulfilled` is the only status that says it arrived.
 */
export async function findStuckOrders(now: Date = new Date()): Promise<StuckOrders> {
  const db = getPrisma();
  const before = (hours: number) => new Date(now.getTime() - hours * HOUR_MS);
  const line = { reference: true, productName: true, branchName: true } as const;

  const [undecided, unpaid, undelivered] = await Promise.all([
    db.order.findMany({
      // No checkout at all: the old path, where the branch has to answer
      // first. A pending order *with* a checkout is waiting on the customer
      // and is listed under "unpaid" instead.
      where: { status: "pending", payments: { none: {} }, createdAt: { lt: before(STUCK_AFTER_HOURS.undecided) } },
      orderBy: { createdAt: "asc" },
      take: MAX_LINES,
      select: { ...line, createdAt: true },
    }),
    db.order.findMany({
      where: {
        payments: { none: { status: "captured" } },
        OR: [
          { status: "confirmed", decidedAt: { lt: before(STUCK_AFTER_HOURS.unpaid) } },
          // Ordered, sent to the pay page, and never paid.
          { status: "pending", payments: { some: {} }, createdAt: { lt: before(STUCK_AFTER_HOURS.unpaid) } },
        ],
      },
      orderBy: { decidedAt: "asc" },
      take: MAX_LINES,
      select: { ...line, decidedAt: true, createdAt: true },
    }),
    db.order.findMany({
      where: {
        status: "confirmed",
        payments: { some: { status: "captured", capturedAt: { lt: before(STUCK_AFTER_HOURS.undelivered) } } },
      },
      orderBy: { decidedAt: "asc" },
      take: MAX_LINES,
      select: {
        ...line,
        createdAt: true,
        payments: { where: { status: "captured" }, select: { capturedAt: true }, take: 1 },
      },
    }),
  ]);

  return {
    undecided: undecided.map((o) => ({ reference: o.reference, productName: o.productName, branchName: o.branchName, hours: hoursSince(o.createdAt, now) })),
    unpaid: unpaid.map((o) => ({ reference: o.reference, productName: o.productName, branchName: o.branchName, hours: hoursSince(o.decidedAt ?? o.createdAt, now) })),
    undelivered: undelivered.map((o) => ({
      reference: o.reference,
      productName: o.productName,
      branchName: o.branchName,
      hours: hoursSince(o.payments[0]?.capturedAt ?? o.createdAt, now),
    })),
  };
}

export interface DigestOutcome {
  /** Whether an email was attempted at all -- false on a day with nothing stuck. */
  sent: boolean;
  undecided: number;
  unpaid: number;
  undelivered: number;
}

/** One email to MalFleks's own inbox listing what is stuck, or nothing at all when nothing is. */
export async function sendStuckOrdersDigest(now: Date = new Date()): Promise<DigestOutcome> {
  const stuck = await findStuckOrders(now);
  const counts = { undecided: stuck.undecided.length, unpaid: stuck.unpaid.length, undelivered: stuck.undelivered.length };
  if (counts.undecided + counts.unpaid + counts.undelivered === 0) return { sent: false, ...counts };

  const { subject, body } = stuckOrdersDigestMessage({ ...stuck, adminUrl: resolveAdminUrl() });
  const result = await sendNotification(subject, body);
  if (!result.sent && result.reason !== "not-configured") {
    await logServerError("stuck-orders-digest", new Error(`Could not email the stuck-orders digest: ${result.reason}`));
  }
  return { sent: true, ...counts };
}

/**
 * Remind each branch, once, about an order it has not answered in a day.
 *
 * "Once" is enforced by the database, not by the schedule: the order is
 * claimed with a guarded `updateMany` (`branchRemindedAt: null` in the WHERE,
 * and still `pending`) *before* the email goes out. A second run, an
 * overlapping run, or a retry of a failed one all match zero rows for an
 * order already claimed. The cost of claiming first is that a reminder lost
 * to a provider failure is not retried -- the right way round for a message
 * whose whole contract is "we only send this once", and the order is in the
 * admin's digest either way.
 *
 * An order whose branch has no partner, no address on file, or a suspended
 * partner is left unclaimed and skipped silently: there is nobody to remind.
 *
 * Returns how many reminders were sent.
 */
export async function remindBranchesOfWaitingOrders(now: Date = new Date()): Promise<number> {
  const db = getPrisma();
  const waiting = await db.order.findMany({
    where: {
      status: "pending",
      branchRemindedAt: null,
      // Only an order that is actually waiting on the branch's answer.
      payments: { none: {} },
      branchId: { not: null },
      // Only a signed-in customer's order was announced to the branch in the
      // first place, and only that kind can go on to be paid.
      customerId: { not: null },
      createdAt: {
        lt: new Date(now.getTime() - STUCK_AFTER_HOURS.undecided * HOUR_MS),
        gt: new Date(now.getTime() - REMIND_WITHIN_DAYS * 24 * HOUR_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_LINES,
    select: { id: true, reference: true, productName: true, branchId: true },
  });

  let reminded = 0;
  const siteUrl = resolveSiteUrl();
  for (const order of waiting) {
    try {
      const branch = order.branchId ? await partnerContact({ branchId: order.branchId }) : null;
      if (!branch?.email || branch.status !== "active") continue;

      const { count } = await db.order.updateMany({
        where: { id: order.id, status: "pending", branchRemindedAt: null },
        data: { branchRemindedAt: now },
      });
      // Answered, or claimed by another run, since the read above.
      if (count === 0) continue;

      const { subject, body } = branchOrderReminderMessage({ reference: order.reference, productName: order.productName, siteUrl });
      const result = await sendPartnerEmail(branch.email, subject, body);
      if (result.sent) reminded += 1;
      else if (result.reason !== "not-configured" && result.reason !== "no-address") {
        await logServerError("branch-order-reminder", new Error(`Could not remind the branch about ${order.reference}: ${result.reason}`));
      }
    } catch (error) {
      // One order's failure must not stop the others being reminded.
      await logServerError("branch-order-reminder", error);
    }
  }
  return reminded;
}

export interface SafetyNetSummary {
  digest: DigestOutcome | null;
  branchReminders: number | null;
}

/**
 * Both halves, each in its own try: a failure listing stuck orders must not
 * stop branches being reminded, and neither may fail the cron run that also
 * reconciles payments. `null` in the summary means that half failed and was
 * logged.
 */
export async function runStuckOrderSafetyNet(now: Date = new Date()): Promise<SafetyNetSummary> {
  let digest: DigestOutcome | null = null;
  let branchReminders: number | null = null;
  try {
    digest = await sendStuckOrdersDigest(now);
  } catch (error) {
    await logServerError("stuck-orders-digest", error);
  }
  try {
    branchReminders = await remindBranchesOfWaitingOrders(now);
  } catch (error) {
    await logServerError("branch-order-reminder", error);
  }
  return { digest, branchReminders };
}
