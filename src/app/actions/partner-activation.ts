"use server";

import { revalidatePath } from "next/cache";

import { adminSession } from "@/server/auth/admin-session";
import type {
  BrandActivationInput,
  CourierActivationInput,
} from "@/server/partners/activation";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";
import { logServerError } from "@/server/error-log";

/**
 * Putting an approved partner into the catalogue — admin only.
 *
 * This is the deliberate second step the schema describes: approval creates an
 * account, and *this* creates the `Branch` or `DeliveryAgent` a customer can
 * see. Keeping them apart is what stops an unconfirmed address reaching the
 * locator because someone filled in a form.
 *
 * Every action here re-checks admin. A Server Action is a public HTTP endpoint
 * and the page rendering the form is not its gate — these write customer-facing
 * catalogue rows, so this is the single most important check in the file.
 */

export type ActivationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "unavailable"
        | "not-found"
        | "wrong-kind"
        | "partner-suspended"
        | "already-live"
        | "missing-field"
        | "unknown-city"
        | "invalid-eta"
        | "name-taken";
    };

// One shared guard: auth configured, right hostname, session, admin.
// See server/auth/admin-session.ts for why it lives in one place now.
const requireAdminSession = adminSession;

/**
 * Everything the catalogue gains here is visible to the public immediately, so
 * the paths that render it are revalidated together. Missing one leaves a
 * branch that exists in the database and nowhere else — the same class of
 * confusion as emptying the catalogue without redeploying.
 */
async function revalidateCatalogue() {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/brands");
  revalidatePath("/search");
  revalidatePath("/locator");
  revalidatePath("/agents");
  // The calls above only clear this (admin) deployment's own cache. This is
  // the one that actually reaches the shop customers browse — see the module
  // doc on notifyPublicSiteOfCatalogueChange for why both are needed.
  await notifyPublicSiteOfCatalogueChange();
}

export async function activateBrand(
  partnerId: string,
  input: BrandActivationInput,
): Promise<ActivationResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { activateBrandPartner } = await import(
      "@/server/partners/activation"
    );
    const outcome = await activateBrandPartner(partnerId, input);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    await revalidateCatalogue();
    return { ok: true };
  } catch (error) {
    await logServerError("activate-brand", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}

export async function activateCourier(
  partnerId: string,
  input: CourierActivationInput,
): Promise<ActivationResult> {
  const session = await requireAdminSession();
  if (!session) return { ok: false, reason: "forbidden" };

  try {
    const { activateCourierPartner } = await import(
      "@/server/partners/activation"
    );
    const outcome = await activateCourierPartner(partnerId, input);
    if (!outcome.ok) return { ok: false, reason: outcome.reason };

    await revalidateCatalogue();
    return { ok: true };
  } catch (error) {
    await logServerError("activate-courier", error, session.uid);
    return { ok: false, reason: "unavailable" };
  }
}
