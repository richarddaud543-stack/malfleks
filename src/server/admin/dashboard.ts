import { getPrisma } from "@/server/db/client";
import { listActivatablePartners } from "@/server/partners/activation";
import { seriesByDay, type DayPoint } from "@/lib/charts";
import { moneyTotals, moneyWork } from "@/server/money/payouts";
import { deliveryProblemWork } from "@/server/orders/delivery-code";

/**
 * Everything the admin Overview shows, read in one place.
 *
 * Ordered the way the page is: what needs a person first, then numbers, then
 * health. Marketplace consoles fail quietly -- an application nobody looked
 * at, a payment nobody noticed -- so the queues carry their *age*, and the
 * oldest item decides how loudly each one is drawn.
 */

const DAY = 86_400_000;
export const SERIES_DAYS = 30;

export type Tone = "clear" | "waiting" | "overdue";

export interface Queue {
  key: string;
  label: string;
  /** One line on what acting on it means. */
  hint: string;
  count: number;
  oldest: Date | null;
  href: string;
  tone: Tone;
}

/** Waiting longer than this is drawn as overdue. */
const OVERDUE_AFTER_HOURS: Record<string, number> = {
  orders: 24, // a customer is waiting on a phone call
  payments: 48, // a payment link sent and not paid
  applications: 72,
  golive: 72,
  submissions: 72,
  payouts: 7 * 24, // partners are paid weekly at the latest
  refunds: 24, // a customer whose order was cancelled is waiting on their money
  deliveries: 12, // goods handed over (or not), nobody paid, and only an admin can settle it
};

function toneFor(key: string, count: number, oldest: Date | null, now: Date): Tone {
  if (count === 0) return "clear";
  if (oldest && now.getTime() - oldest.getTime() > OVERDUE_AFTER_HOURS[key] * 3_600_000) {
    return "overdue";
  }
  return "waiting";
}

/** Badge counts for the sidebar: only the things that are someone's job. */
export interface NavCounts {
  orders: number;
  applications: number;
  submissions: number;
  payments: number;
  /** Payees owed + payouts not yet sent + refunds not yet recorded. */
  payouts: number;
  /** Questions agents are waiting for the owner to answer. */
  city: number;
  /** Things the rulebook could not settle by itself and has brought to the owner. */
  rules: number;
}

export async function getNavCounts(): Promise<NavCounts> {
  const db = getPrisma();
  const [orders, applications, submissions, payments, work, city, deliveries, rules] = await Promise.all([
    db.order.count({ where: { status: "pending" } }),
    db.partnerApplication.count({ where: { status: "pending" } }),
    db.productSubmission.count({ where: { status: "pending" } }),
    db.orderPayment.count({ where: { status: "pending" } }),
    moneyWork(db),
    db.agentHelpRequest.count({ where: { status: "open" } }),
    deliveryProblemWork(db),
    db.ownerAlert.count({ where: { status: "open" } }),
  ]);
  return {
    // Orders to confirm, plus deliveries only an admin can settle.
    orders: orders + deliveries.count,
    applications,
    submissions,
    payments,
    payouts: work.payeesOwed + work.pendingBatches + work.refundsDue.length,
    city,
    rules,
  };
}

export interface Health {
  emailConfigured: boolean;
  /** Presence only. These are never read, printed or compared -- just "is it set". */
  clickpesa: { clientId: boolean; apiKey: boolean; checksumSecret: boolean };
  cronSecret: boolean;
  lastReconciledAt: Date | null;
  errors24h: number;
  errors7d: number;
}

export interface Overview {
  now: Date;
  queues: Queue[];
  orders: { total: number; last30: number; series: DayPoint[] };
  money: { collectedTZS: number; heldTZS: number; last30TZS: number; series: DayPoint[] };
  catalogue: { partnersLive: number; products: number; brands: number };
  statusCounts: Record<"pending" | "confirmed" | "fulfilled" | "cancelled", number>;
  byBrand: { label: string; value: number }[];
  health: Health;
}

const present = (name: string) => Boolean(process.env[name]?.trim());

export async function getOverview(now = new Date()): Promise<Overview> {
  const db = getPrisma();
  const since = new Date(now.getTime() - SERIES_DAYS * DAY);

  const [
    pendingOrders,
    oldestOrder,
    pendingPayments,
    oldestPayment,
    pendingApplications,
    oldestApplication,
    pendingSubmissions,
    oldestSubmission,
    activatable,
    ordersTotal,
    recentOrders,
    statusGroups,
    brandGroups,
    totals,
    recentCollections,
    partnersLive,
    products,
    brands,
    lastCheck,
    errors24h,
    errors7d,
    work,
    deliveries,
  ] = await Promise.all([
    db.order.count({ where: { status: "pending" } }),
    db.order.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.orderPayment.count({ where: { status: "pending" } }),
    db.orderPayment.findFirst({ where: { status: "pending" }, orderBy: { initiatedAt: "asc" }, select: { initiatedAt: true } }),
    db.partnerApplication.count({ where: { status: "pending" } }),
    db.partnerApplication.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.productSubmission.count({ where: { status: "pending" } }),
    db.productSubmission.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    listActivatablePartners(),
    db.order.count(),
    db.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.order.groupBy({ by: ["brandName"], _count: { _all: true } }),
    moneyTotals(db),
    db.ledgerEntry.findMany({ where: { kind: "collected", createdAt: { gte: since } }, select: { createdAt: true, amountTZS: true } }),
    db.partner.count({ where: { status: "active", OR: [{ branchId: { not: null } }, { agentId: { not: null } }] } }),
    db.product.count(),
    db.brand.count(),
    db.orderPayment.aggregate({ _max: { lastCheckedAt: true } }),
    db.serverErrorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - DAY) } } }),
    db.serverErrorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    moneyWork(db),
    deliveryProblemWork(db),
  ]);

  const oldestGoLive = activatable.reduce<Date | null>(
    (min, p) => (min === null || p.approvedAt < min ? p.approvedAt : min),
    null,
  );

  const queueSpecs = [
    { key: "orders", label: "Orders to confirm", hint: "Ring the branch, check stock and price", count: pendingOrders, oldest: oldestOrder?.createdAt ?? null, href: "/admin/orders?status=pending" },
    { key: "payments", label: "Payments not yet received", hint: "Links sent, money not in", count: pendingPayments, oldest: oldestPayment?.initiatedAt ?? null, href: "/admin/money" },
    { key: "applications", label: "Partner applications", hint: "Approve or reject", count: pendingApplications, oldest: oldestApplication?.createdAt ?? null, href: "/admin/applications" },
    { key: "golive", label: "Approved, not yet live", hint: "Put them on the map or in the routing", count: activatable.length, oldest: oldestGoLive, href: "/admin/applications" },
    { key: "submissions", label: "Product submissions", hint: "Publish or send back", count: pendingSubmissions, oldest: oldestSubmission?.createdAt ?? null, href: "/admin/submissions" },
    { key: "deliveries", label: "Deliveries to settle", hint: "The code could not confirm them — ring the customer", count: deliveries.count, oldest: deliveries.oldest, href: deliveries.count === 1 ? `/admin/orders/${deliveries.orders[0].orderId}` : "/admin/orders?status=confirmed&payment=captured" },
    { key: "payouts", label: "Partners to pay", hint: "Sent automatically when that is on; otherwise send from ClickPesa and record it", count: work.payeesOwed + work.pendingBatches, oldest: work.oldestPayout, href: "/admin/payouts" },
    { key: "refunds", label: "Refunds to send", hint: "Cancelled orders still holding money", count: work.refundsDue.length, oldest: work.refundsDue.reduce<Date | null>((min, r) => (r.cancelledAt && (!min || r.cancelledAt < min) ? r.cancelledAt : min), null), href: work.refundsDue.length === 1 ? `/admin/orders/${work.refundsDue[0].orderId}` : "/admin/orders?status=cancelled&payment=captured" },
  ];
  const queues: Queue[] = queueSpecs.map((q) => ({ ...q, tone: toneFor(q.key, q.count, q.oldest, now) }));

  const statusCounts = { pending: 0, confirmed: 0, fulfilled: 0, cancelled: 0 };
  for (const g of statusGroups) {
    if (g.status in statusCounts) statusCounts[g.status as keyof typeof statusCounts] = g._count._all;
  }

  const collectedTZS = totals.collectedTZS;
  const moneySeries = seriesByDay(recentCollections, (e) => e.createdAt, (e) => e.amountTZS, now, SERIES_DAYS);

  return {
    now,
    queues,
    orders: {
      total: ordersTotal,
      last30: recentOrders.length,
      series: seriesByDay(recentOrders, (o) => o.createdAt, () => 1, now, SERIES_DAYS),
    },
    money: {
      collectedTZS,
      // Held = collected, less refunds sent, less payouts marked sent. See
      // `moneyTotals` -- one definition shared with the Money page.
      heldTZS: totals.heldTZS,
      last30TZS: moneySeries.reduce((sum, p) => sum + p.value, 0),
      series: moneySeries,
    },
    catalogue: { partnersLive, products, brands },
    statusCounts,
    byBrand: brandGroups
      .map((g) => ({ label: g.brandName, value: g._count._all }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    health: {
      emailConfigured: (await import("@/server/notify/email")).isEmailConfigured(),
      clickpesa: {
        clientId: present("CLICKPESA_CLIENT_ID"),
        apiKey: present("CLICKPESA_API_KEY"),
        checksumSecret: present("CLICKPESA_CHECKSUM_SECRET"),
      },
      cronSecret: present("CRON_SECRET"),
      lastReconciledAt: lastCheck._max.lastCheckedAt ?? null,
      errors24h,
      errors7d,
    },
  };
}
