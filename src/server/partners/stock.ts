import { getPrisma } from "@/server/db/client";
import { partnerForUser } from "./portal";

/**
 * A branch marking its own live products in or out of stock.
 *
 * Until 3 Oct 2026 only a MalFleks admin could do this, from
 * `/admin/catalogue`. That put the one fact a shop knows minute to minute --
 * "we just sold the last one" -- behind a phone call to somebody who does not
 * know it, and an out-of-stock product that still says "in stock" is an order
 * the branch then has to decline. The admin keeps the same power
 * (`setProductStock` in `src/server/admin/catalogue.ts`); this is the
 * partner's own, narrower one.
 *
 * ## Narrower how
 *
 * - **Their own branch only.** The branch comes from the session's partner and
 *   goes in the WHERE of both the read and the write. A product id from
 *   another branch matches nothing and reads as `not-found`.
 * - **Live products only.** A product an admin has hidden (`hiddenAt` set) is
 *   not listed and cannot be flipped. Stock and visibility are separate
 *   switches, and nothing here touches `hiddenAt` -- a hidden product stays
 *   hidden whatever a partner presses.
 * - **Stock only.** Name, price and description still go through review; a
 *   price a partner could change on a live product is a price nobody checked.
 * - **An active partner only**, like every other partner write.
 */

export interface LiveProduct {
  id: string;
  name: string;
  priceTZS: number;
  inStock: boolean;
}

/** This branch's products that are on the shop now, in shop order. */
export async function listLiveProductsForBranch(branchId: string): Promise<LiveProduct[]> {
  if (branchId.trim() === "") return [];
  return getPrisma().product.findMany({
    where: { branchId, hiddenAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, priceTZS: true, inStock: true },
  });
}

export type PartnerStockBlocker = "not-a-partner" | "partner-suspended" | "not-found";

export type PartnerStockOutcome =
  | { ok: true; inStock: boolean }
  | { ok: false; reason: PartnerStockBlocker };

/**
 * Sets `inStock` on one of the caller's own live products.
 *
 * `uid` is the verified session's; `productId` is the only thing the browser
 * supplies and decides nothing about ownership. The write is an `updateMany`
 * with the branch and `hiddenAt: null` in the WHERE, so the check and the
 * write cannot disagree -- a product hidden, or moved to another branch,
 * between the two matches zero rows.
 *
 * Setting it to what it already is succeeds: the caller wanted that state and
 * has it.
 */
export async function setStockAsPartner(
  uid: string,
  productId: string,
  inStock: boolean,
): Promise<PartnerStockOutcome> {
  const partner = await partnerForUser(uid);
  if (!partner) return { ok: false, reason: "not-a-partner" };
  if (partner.status !== "active") return { ok: false, reason: "partner-suspended" };
  // A courier, or a branch not on the map yet, has no products at all.
  if (partner.kind !== "brand" || !partner.branchId) return { ok: false, reason: "not-found" };
  if (typeof productId !== "string" || productId.trim() === "") return { ok: false, reason: "not-found" };

  const { count } = await getPrisma().product.updateMany({
    where: { id: productId, branchId: partner.branchId, hiddenAt: null },
    data: { inStock: Boolean(inStock) },
  });
  return count === 1 ? { ok: true, inStock: Boolean(inStock) } : { ok: false, reason: "not-found" };
}
