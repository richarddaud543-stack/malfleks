"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";

/**
 * A partner marking one of their own live products in or out of stock.
 *
 * In its own file for the reason `partner-orders.ts` gives: the admin's
 * version (`setProductStockAction` in `admin-console.ts`) sits behind the
 * admin trust check, and this one sits behind the partner trust check. Two
 * boundaries in one file is how an edit ends up applying the wrong one.
 *
 * A Server Action is a public HTTP endpoint. The session is re-read here, and
 * `setStockAsPartner` proves from the database that the signed-in user's
 * active partner owns the product's branch -- the product id in the request
 * says which product, never whose.
 */

export type PartnerStockResult =
  | { ok: true; inStock: boolean }
  | {
      ok: false;
      reason: "signed-out" | "unavailable" | "not-a-partner" | "partner-suspended" | "not-found";
    };

/**
 * Stock shows on the product page, the brand and branch pages, search, the
 * home rail and the delivery step, and it decides whether an order can be
 * placed at all. The same set of paths the admin's stock toggle clears, for
 * the same reason, followed by the same ping to the shop deployment.
 */
async function revalidateCatalogue() {
  revalidatePath("/admin/catalogue");
  revalidatePath("/admin/partners", "layout");
  revalidatePath("/");
  revalidatePath("/brands", "layout");
  revalidatePath("/products", "layout");
  revalidatePath("/delivery", "layout");
  revalidatePath("/search");
  revalidatePath("/locator");
  revalidatePath("/partner");
  await notifyPublicSiteOfCatalogueChange();
}

export async function setOwnProductStockAction(
  productId: string,
  inStock: boolean,
): Promise<PartnerStockResult> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };

  try {
    const { setStockAsPartner } = await import("@/server/partners/stock");
    const outcome = await setStockAsPartner(session.uid, String(productId), inStock === true);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    await revalidateCatalogue();
    return { ok: true, inStock: outcome.inStock };
  } catch (error) {
    await logServerError("partner-set-stock", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
