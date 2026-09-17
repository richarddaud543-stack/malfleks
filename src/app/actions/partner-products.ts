"use server";

import { revalidatePath } from "next/cache";

import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { checkRateLimit } from "@/server/rate-limit";

// A real partner adding their catalogue is a handful of submissions in a
// sitting, not dozens per minute — this bounds a compromised or scripted
// session from flooding the admin review queue, not normal listing work.
const LIST_PRODUCT_RATE_LIMIT = { action: "list-product", limit: 30, windowMs: 60 * 60_000 };

/**
 * A partner listing a product of their own.
 *
 * **The partner is resolved from the session, never from the payload.** That is
 * the same boundary `submitProduct` already holds one layer down when it reads
 * `branchId` and `brandId` off the partner record: the browser says *what* it
 * wants listed, never *who is listing it*. A `partnerId` in this input would
 * let anyone file a product under a competitor's branch, and orders route back
 * to whichever branch a product names.
 *
 * A Server Action is a public HTTP endpoint. The page that renders the form is
 * not a gate — this is, and it re-checks the session for that reason, exactly
 * as `partner-review.ts` and `orders.ts` do.
 */

export type ListProductResult =
  | { listed: true; id: string }
  | {
      listed: false;
      reason:
        | "signed-out"
        | "unavailable"
        | "not-a-partner"
        | "not-a-branch-partner"
        | "partner-suspended"
        | "missing-field"
        | "invalid-price"
        | "invalid-photo"
        | "rate-limited"
        | "failed";
    };

export interface ListProductInput {
  name: string;
  category: string;
  description: string;
  image: string;
  photoUrl?: string;
  priceTZS: number;
  inStock?: boolean;
  specs?: { key: string; value: string }[];
}

export async function listProductForPartner(
  input: ListProductInput,
): Promise<ListProductResult> {
  if (!isAuthConfigured()) return { listed: false, reason: "unavailable" };

  const session = await verifySession();
  if (!session) return { listed: false, reason: "signed-out" };

  const limit = await checkRateLimit(session.uid, LIST_PRODUCT_RATE_LIMIT);
  if (!limit.allowed) return { listed: false, reason: "rate-limited" };

  try {
    // Dynamic because these modules reach the database, and most page loads
    // never call this action.
    const { partnerForUser } = await import("@/server/partners/portal");
    const partner = await partnerForUser(session.uid);
    if (!partner) return { listed: false, reason: "not-a-partner" };

    const { submitProduct } = await import("@/server/partners/submissions");
    const outcome = await submitProduct(partner.partnerId, {
      name: input.name,
      category: input.category,
      description: input.description,
      image: input.image,
      photoUrl: input.photoUrl,
      priceTZS: input.priceTZS,
      inStock: input.inStock,
      specs: input.specs,
    });

    if (!outcome.ok) return { listed: false, reason: outcome.reason };

    // The dashboard counts and the listing table both change.
    revalidatePath("/partner");
    return { listed: true, id: outcome.value.id };
  } catch {
    // Deliberately opaque to the caller. The reason a write failed is not the
    // partner's business and may name internals.
    return { listed: false, reason: "failed" };
  }
}
