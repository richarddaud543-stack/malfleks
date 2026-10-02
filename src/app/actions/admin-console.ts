"use server";

import { revalidatePath } from "next/cache";

import { adminSession } from "@/server/auth/admin-session";
import { logServerError } from "@/server/error-log";
import { notifyPublicSiteOfCatalogueChange } from "@/server/revalidate-public-site";

/**
 * Server Actions for the console's newer pages: order money, payouts,
 * partners and catalogue.
 *
 * Every one re-checks `adminSession()` itself. A Server Action is a public
 * HTTP endpoint; the page that renders the button is not its gate. Each takes
 * `(previousState, formData)` so the page can use `useActionState` and show
 * what happened next to the button that did it.
 *
 * The server modules they call do the real work and hold the guards (guarded
 * `updateMany`s, row locks, validation). These only translate outcomes into
 * sentences an operator can act on.
 */

export type ConsoleState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

const FORBIDDEN: ConsoleState = { status: "error", message: "Your session no longer has admin access. Sign in again." };
const FAILED: ConsoleState = { status: "error", message: "That didn't go through, and nothing changed. It has been logged — try again." };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function revalidateMoney(orderId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/money");
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/partners", "layout");
  revalidatePath("/admin/orders");
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// Order money
// ---------------------------------------------------------------------------

export async function accruePayoutsAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const orderId = field(formData, "orderId");
  try {
    const { accruePayoutsNow } = await import("@/server/money/payouts");
    const outcome = await accruePayoutsNow(orderId);
    revalidateMoney(orderId);
    switch (outcome) {
      case "accrued":
        return { status: "ok", message: "Done — what the branch and courier are owed is now on the Payouts page." };
      case "already-accrued":
        return { status: "ok", message: "Already worked out." };
      case "not-fulfilled":
        return { status: "error", message: "Only a delivered order is split. Mark it fulfilled first." };
      case "not-paid":
        return { status: "error", message: "No captured payment on this order, so there is nothing to split." };
      case "no-quote":
        return { status: "error", message: "This order has no fee quote, so the split can't be worked out." };
      case "amount-mismatch":
        return { status: "error", message: "What was captured doesn't match the order total. Nothing written — check the payment." };
      case "bad-quote":
        return { status: "error", message: "The order's stored fees don't add up to its total. Nothing written." };
    }
  } catch (error) {
    await logServerError("accrue-payouts", error, session.uid);
    return FAILED;
  }
}

export async function recordRefundAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const orderId = field(formData, "orderId");
  const amount = Number(field(formData, "amount").replace(/[,\s]/g, ""));
  try {
    const { recordRefund } = await import("@/server/money/payouts");
    const outcome = await recordRefund(orderId, amount, field(formData, "reference"), session.uid);
    if (outcome.ok) {
      // Recorded and committed: tell the customer how much and under what
      // reference. Notification only -- the refund itself is unchanged.
      const { notifyRefundRecorded } = await import("@/server/notify/events");
      await notifyRefundRecorded(orderId, amount, field(formData, "reference"));
      revalidateMoney(orderId);
      return { status: "ok", message: "Refund recorded." };
    }
    const messages: Record<typeof outcome.reason, string> = {
      "not-found": "This order no longer exists.",
      "not-cancelled": "Refunds are recorded only on a cancelled order.",
      "bad-amount": "Enter the amount in whole shillings.",
      "too-much": "That's more than is still held for this order.",
      "bad-reference": "Enter the reference ClickPesa or the network gave the refund (4–64 letters or numbers).",
    };
    return { status: "error", message: messages[outcome.reason] };
  } catch (error) {
    await logServerError("record-refund", error, session.uid);
    return FAILED;
  }
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function createPayoutAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const payeeType = field(formData, "payeeType");
  const payeeId = field(formData, "payeeId");
  if ((payeeType !== "branch" && payeeType !== "agent") || !payeeId) return { status: "error", message: "No payee given." };
  try {
    const { createPayoutBatch } = await import("@/server/money/payouts");
    const outcome = await createPayoutBatch({ payeeType, payeeId }, session.uid);
    if (!outcome.ok) {
      return {
        status: "error",
        message: outcome.reason === "nothing-owed" ? "Nothing is owed to them right now." : "Someone else just changed this. Reload and try again.",
      };
    }
    revalidateMoney();
    return { status: "ok", message: "Payout drawn up. Send it from ClickPesa, then record the reference below." };
  } catch (error) {
    await logServerError("create-payout", error, session.uid);
    return FAILED;
  }
}

export async function markPayoutPaidAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { markPayoutPaid } = await import("@/server/money/payouts");
    const outcome = await markPayoutPaid(field(formData, "batchId"), field(formData, "reference"), session.uid);
    if (outcome.ok) {
      // Recorded as sent, by this call (a repeat is `not-pending`): tell the
      // branch or courier the amount and the reference to look for.
      const { notifyPayoutSent } = await import("@/server/notify/events");
      await notifyPayoutSent(field(formData, "batchId"));
      revalidateMoney();
      return { status: "ok", message: "Recorded as sent." };
    }
    const messages: Record<typeof outcome.reason, string> = {
      "not-pending": "This payout is no longer waiting — someone already recorded or cancelled it.",
      "reference-used": "That reference is already on another payout. Check you copied the right one.",
      "bad-reference": "Enter the payout reference from ClickPesa (4–64 letters or numbers).",
    };
    return { status: "error", message: messages[outcome.reason] };
  } catch (error) {
    await logServerError("mark-payout-paid", error, session.uid);
    return FAILED;
  }
}

export async function cancelPayoutAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { cancelPayoutBatch } = await import("@/server/money/payouts");
    const outcome = await cancelPayoutBatch(field(formData, "batchId"), field(formData, "reason"), session.uid);
    if (!outcome.ok) return { status: "error", message: "This payout is no longer waiting." };
    revalidateMoney();
    return { status: "ok", message: "Cancelled. What it covered is owed again." };
  } catch (error) {
    await logServerError("cancel-payout", error, session.uid);
    return FAILED;
  }
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export async function setPartnerStatusAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const partnerId = field(formData, "partnerId");
  const status = field(formData, "status");
  if (status !== "active" && status !== "suspended") return { status: "error", message: "Unknown status." };
  try {
    const { setPartnerStatus } = await import("@/server/admin/partners");
    const outcome = await setPartnerStatus(partnerId, status, field(formData, "note"), session.uid);
    if (!outcome.ok) {
      const messages: Record<typeof outcome.reason, string> = {
        "not-found": "This partner no longer exists.",
        "no-change": `Already ${status}.`,
        "note-required": "Say why — it's shown to whoever looks at this partner next.",
      };
      return { status: "error", message: messages[outcome.reason] };
    }
    // The status changed (a repeat is `no-change` above): tell the partner,
    // with the reason for a suspension.
    const { notifyPartnerStatus } = await import("@/server/notify/events");
    await notifyPartnerStatus(partnerId);

    revalidatePath("/admin/partners", "layout");
    revalidatePath("/admin");
    revalidatePath("/partner");
    return { status: "ok", message: status === "suspended" ? "Suspended." : "Reactivated." };
  } catch (error) {
    await logServerError("set-partner-status", error, session.uid);
    return FAILED;
  }
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

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
  // The shop is a separate deployment with its own cache; see the module doc.
  await notifyPublicSiteOfCatalogueChange();
}

export async function updateProductAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { updateProduct } = await import("@/server/admin/catalogue");
    const outcome = await updateProduct(field(formData, "productId"), {
      name: field(formData, "name"),
      priceTZS: field(formData, "priceTZS"),
      description: field(formData, "description"),
      inStock: formData.get("inStock") === "on",
    });
    if (!outcome.ok) {
      const messages: Record<typeof outcome.reason, string> = {
        "not-found": "This product no longer exists.",
        "bad-name": "The name should be 2–120 characters.",
        "bad-price": "Enter the price in whole shillings, e.g. 45000.",
        "bad-description": "The description should be 10–2,000 characters.",
      };
      return { status: "error", message: messages[outcome.reason] };
    }
    await revalidateCatalogue();
    return { status: "ok", message: "Saved. The shop shows it within a minute." };
  } catch (error) {
    await logServerError("update-product", error, session.uid);
    return FAILED;
  }
}

export async function setProductHiddenAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const hidden = field(formData, "hidden") === "true";
  try {
    const { setProductHidden } = await import("@/server/admin/catalogue");
    const outcome = await setProductHidden(field(formData, "productId"), hidden);
    if (!outcome.ok) return { status: "error", message: "This product no longer exists." };
    await revalidateCatalogue();
    return { status: "ok", message: hidden ? "Hidden from the shop." : "Back on the shop." };
  } catch (error) {
    await logServerError("set-product-hidden", error, session.uid);
    return FAILED;
  }
}

export async function setProductStockAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const inStock = field(formData, "inStock") === "true";
  try {
    const { setProductStock } = await import("@/server/admin/catalogue");
    const outcome = await setProductStock(field(formData, "productId"), inStock);
    if (!outcome.ok) return { status: "error", message: "This product no longer exists." };
    await revalidateCatalogue();
    return { status: "ok", message: inStock ? "In stock." : "Out of stock." };
  } catch (error) {
    await logServerError("set-product-stock", error, session.uid);
    return FAILED;
  }
}
