"use server";

import { revalidatePath } from "next/cache";

import type { ConsoleState } from "@/app/actions/admin-console";
import { adminSession } from "@/server/auth/admin-session";
import { logServerError } from "@/server/error-log";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";

/**
 * Server Actions for a live product's photos, from /admin/catalogue.
 *
 * Built exactly like the catalogue actions in `admin-console.ts` and kept in
 * a file of their own only so the two can be worked on separately: each one
 * re-checks `adminSession()` itself (a Server Action is a public HTTP
 * endpoint; the page that renders the button is not its gate), takes
 * `(previousState, formData)` so `ActionForm` can show what happened beside
 * the button, and returns the same `ConsoleState`.
 *
 * The guard that matters — writing only if the photo list is still what the
 * operator was looking at — lives in `src/server/admin/catalogue.ts`. These
 * only turn its outcomes into sentences.
 */

const FORBIDDEN: ConsoleState = { status: "error", message: "Your session no longer has admin access. Sign in again." };
const FAILED: ConsoleState = { status: "error", message: "That didn't go through, and nothing changed. It has been logged — try again." };

const PHOTO_MESSAGES = {
  "not-found": "This product no longer exists.",
  "no-such-photo": "That photo is no longer on this product. Reload the page.",
  changed: "Someone else just changed this product's photos. Reload the page and try again.",
} as const;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * The same set `revalidateCatalogue` in `admin-console.ts` clears, for the
 * same reason: a photo is part of what every one of these pages draws.
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
  // The shop is a separate deployment with its own cache; see
  // `revalidate-public-site.ts`.
  await notifyPublicSiteOfCatalogueChange();
}

export async function removeProductPhotoAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { removeProductPhoto } = await import("@/server/admin/catalogue");
    const outcome = await removeProductPhoto(field(formData, "productId"), field(formData, "photoUrl"));
    if (!outcome.ok) return { status: "error", message: PHOTO_MESSAGES[outcome.reason] };
    await revalidateCatalogue();
    return { status: "ok", message: "Photo removed. The shop shows it within a minute." };
  } catch (error) {
    await logServerError("remove-product-photo", error, session.uid);
    return FAILED;
  }
}

export async function setMainProductPhotoAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { setMainProductPhoto } = await import("@/server/admin/catalogue");
    const outcome = await setMainProductPhoto(field(formData, "productId"), field(formData, "photoUrl"));
    if (!outcome.ok) return { status: "error", message: PHOTO_MESSAGES[outcome.reason] };
    await revalidateCatalogue();
    return { status: "ok", message: "Main photo changed. The shop shows it within a minute." };
  } catch (error) {
    await logServerError("set-main-product-photo", error, session.uid);
    return FAILED;
  }
}
