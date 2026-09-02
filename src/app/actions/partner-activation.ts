"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { isAdminUser } from "@/server/auth/admin";
import { verifySession } from "@/server/auth/dal";
import type {
  BrandActivationInput,
  CourierActivationInput,
} from "@/server/partners/activation";

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

async function requireAdminSession() {
  if (!isAuthConfigured()) return null;
  const session = await verifySession();
  if (!session || !isAdminUser(session)) return null;
  return session;
}

/**
 * Everything the catalogue gains here is visible to the public immediately, so
 * the paths that render it are revalidated together. Missing one leaves a
 * branch that exists in the database and nowhere else — the same class of
 * confusion as emptying the catalogue without redeploying.
 */
function revalidateCatalogue() {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/brands");
  revalidatePath("/search");
  revalidatePath("/locator");
  revalidatePath("/agents");
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

    revalidateCatalogue();
    return { ok: true };
  } catch {
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

    revalidateCatalogue();
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
