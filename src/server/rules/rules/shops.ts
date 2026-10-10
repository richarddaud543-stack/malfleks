import type { Prisma } from "@prisma/client";

import { resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { sendPartnerEmail } from "@/server/notify/email";
import { partnerContact } from "@/server/notify/events";
import { listingsHiddenMessage } from "@/server/notify/rule-messages";
import { RULES_ACTOR } from "@/server/orders/status";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";
import { raiseAlert } from "../alerts";
import { HOUR_MS, SHOP_RELIABILITY } from "../thresholds";
import type { Rule } from "../types";

/**
 * A shop that keeps taking customers' money for orders it does not deliver.
 *
 * Each failure is already made good one at a time: the order is cancelled and
 * the customer refunded. This rule is about the pattern. Three failed paid
 * orders in a month means the next customer is likely to be the fourth, and
 * with the owner away nobody would stop that. So the shop's products come off
 * the shop -- hidden, not deleted, and put back with one button.
 *
 * A "failure" is a **paid** order that was cancelled by the shop itself or by
 * the delivery deadline. Declining an order nobody had paid for is not one:
 * that is a shop being honest about its stock.
 */

export interface ShopFailure {
  branchId: string;
  orderId: string;
  decidedAt: Date;
}

/**
 * The shops over the line, given the failures in the window and when each shop
 * was last cleared. Pure.
 *
 * `clearedAt` is when the owner last resolved this rule's alert for the shop.
 * Failures before that moment were already answered for; without it, the same
 * three orders would hide the shop again the instant he restored it.
 */
export function shopsOverTheLine(failures: ShopFailure[], clearedAt: Map<string, Date>, threshold: number = SHOP_RELIABILITY.failures): Map<string, ShopFailure[]> {
  const byShop = new Map<string, ShopFailure[]>();
  for (const failure of failures) {
    const cleared = clearedAt.get(failure.branchId);
    if (cleared && failure.decidedAt <= cleared) continue;
    byShop.set(failure.branchId, [...(byShop.get(failure.branchId) ?? []), failure]);
  }
  return new Map([...byShop].filter(([, list]) => list.length >= threshold));
}

/** Paid orders cancelled by the shop or by the deadline, in the window. */
export async function shopFailures(now: Date): Promise<ShopFailure[]> {
  const db = getPrisma();
  const since = new Date(now.getTime() - SHOP_RELIABILITY.windowDays * 24 * HOUR_MS);
  const cancelled = await db.order.findMany({
    where: { status: "cancelled", branchId: { not: null }, decidedAt: { gte: since }, payments: { some: { status: "captured" } } },
    select: { id: true, branchId: true, decidedBy: true, decidedAt: true, payments: { where: { status: "captured" }, select: { capturedAt: true }, take: 1 } },
    take: 500,
  });
  const deciders = [...new Set(cancelled.map((o) => o.decidedBy).filter((uid): uid is string => Boolean(uid)))];
  const partnerUids = new Set((await db.partnerUser.findMany({ where: { uid: { in: deciders } }, select: { uid: true } })).map((p) => p.uid));

  return cancelled
    .filter((o) => {
      if (!o.branchId || !o.decidedAt) return false;
      const paidAt = o.payments[0]?.capturedAt;
      // Paid after it was already cancelled: the customer used an old link.
      // Not the shop's doing.
      if (!paidAt || paidAt > o.decidedAt) return false;
      return o.decidedBy === RULES_ACTOR || (o.decidedBy != null && partnerUids.has(o.decidedBy));
    })
    .map((o) => ({ branchId: o.branchId!, orderId: o.id, decidedAt: o.decidedAt! }));
}

export const shopReliability: Rule = {
  key: "shop-reliability",
  group: "shops",
  title: "Take an unreliable shop's products off the shop",
  when: `A shop has had ${SHOP_RELIABILITY.failures} paid orders cancelled in ${SHOP_RELIABILITY.windowDays} days, because it declined them after payment or missed the delivery deadline.`,
  then: "Its products are hidden from the shop (not deleted), the shop is told why, and you are told. You put them back with one button once you have spoken to them.",
  async run(ctx) {
    const db = getPrisma();
    const failures = await shopFailures(ctx.now);
    if (failures.length < SHOP_RELIABILITY.failures) return { acted: 0, notes: [] };

    // When each shop's last alert was resolved. The shop is recorded in the
    // alert's `data`, because a resolved alert no longer has its `openKey`.
    const resolved = await db.ownerAlert.findMany({
      where: { key: "shop-reliability", status: "resolved" },
      orderBy: { resolvedAt: "asc" },
      select: { data: true, resolvedAt: true },
      take: 500,
    });
    const clearedAt = new Map<string, Date>();
    for (const alert of resolved) {
      const branchId = (alert.data as { branchId?: unknown } | null)?.branchId;
      if (typeof branchId === "string" && alert.resolvedAt) clearedAt.set(branchId, alert.resolvedAt);
    }

    const notes: string[] = [];
    for (const [branchId, list] of shopsOverTheLine(failures, clearedAt)) {
      // An alert already open for this shop means it is already hidden and
      // waiting for the owner.
      const alreadyOpen = await db.ownerAlert.count({ where: { openKey: `shop-reliability:${branchId}` } });
      if (alreadyOpen > 0) continue;

      const branch = await db.branch.findUnique({ where: { id: branchId }, select: { name: true, city: true } });
      if (!branch) continue;
      const live = await db.product.findMany({ where: { branchId, hiddenAt: null }, select: { id: true } });
      const productIds = live.map((p) => p.id);
      const data: Prisma.InputJsonValue = { branchId, productIds, orderIds: list.map((f) => f.orderId) };

      const { raised } = await raiseAlert(
        {
          key: "shop-reliability",
          subjectId: branchId,
          urgency: "urgent",
          subject: `${branch.name} has failed ${list.length} paid orders — its products are hidden`,
          body: [
            `${branch.name} (${branch.city}) has had ${list.length} paid orders cancelled in the last ${SHOP_RELIABILITY.windowDays} days,`,
            "because it declined them after the customer paid or did not deliver them in time.",
            "Each customer has been (or is being) refunded.",
            "",
            `To stop a next customer paying for something that will not arrive, its ${productIds.length} product${productIds.length === 1 ? " has" : "s have"} been hidden from the shop.`,
            "Nothing is deleted and the shop can still sign in.",
            "",
            'Speak to the shop. When you are satisfied, press "Put the products back" on the Rules page.',
          ].join("\n"),
          href: "/admin/rules",
          data,
        },
        ctx.env,
      );
      // Raised first, and only the pass that raised it hides anything: the
      // alert is what records which products to put back.
      if (!raised) continue;

      if (productIds.length > 0) {
        await db.product.updateMany({ where: { id: { in: productIds }, hiddenAt: null }, data: { hiddenAt: ctx.now } });
        await notifyPublicSiteOfCatalogueChange();
      }

      const contact = await partnerContact({ branchId });
      if (contact?.email) {
        const message = listingsHiddenMessage({ failures: list.length, windowDays: SHOP_RELIABILITY.windowDays, hidden: productIds.length, siteUrl: resolveSiteUrl(ctx.env) });
        const sent = await sendPartnerEmail(contact.email, message.subject, message.body, ctx.env);
        if (!sent.sent && sent.reason !== "no-address" && sent.reason !== "not-configured") {
          await logServerError("rule-shop-reliability", new Error(`Could not tell ${branch.name} its products were hidden: ${sent.reason}`));
        }
      }
      notes.push(`Hid ${productIds.length} product${productIds.length === 1 ? "" : "s"} of ${branch.name} after ${list.length} failed paid orders.`);
    }
    return { acted: notes.length, notes };
  },
};

/**
 * The owner pressing "Put the products back": un-hides exactly the products
 * this rule hid for that alert -- not ones an admin hid for another reason
 * before or since. Returns how many came back.
 */
export async function restoreHiddenListings(alertId: string): Promise<number> {
  const db = getPrisma();
  const alert = await db.ownerAlert.findUnique({ where: { id: alertId }, select: { key: true, data: true } });
  if (!alert || alert.key !== "shop-reliability") return 0;
  const ids = (alert.data as { productIds?: unknown } | null)?.productIds;
  const productIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  if (productIds.length === 0) return 0;
  const { count } = await db.product.updateMany({ where: { id: { in: productIds }, hiddenAt: { not: null } }, data: { hiddenAt: null } });
  if (count > 0) await notifyPublicSiteOfCatalogueChange();
  return count;
}
