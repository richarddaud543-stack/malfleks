"use server";

import { revalidateSitePath } from "@/server/revalidate-site";
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

/** The off switch for automatic payouts. Pausing takes effect on the next run; it recalls nothing already sent. */
export async function setAutoPayoutsPausedAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const paused = field(formData, "paused") === "true";
  try {
    const { setAutoPayoutsPaused } = await import("@/server/money/auto-payouts");
    await setAutoPayoutsPaused(paused, session.uid);
    revalidateMoney();
    return {
      status: "ok",
      message: paused ? "Paused. Nothing more is sent automatically until you resume." : "Resumed. The next confirmed delivery is paid automatically.",
    };
  } catch (error) {
    await logServerError("set-auto-payouts-paused", error, session.uid);
    return FAILED;
  }
}

const SKIP_WORDS: Record<string, string> = {
  "no-mobile-number": "no mobile number on file",
  "below-minimum": "under ClickPesa's 2,500 TSh minimum",
  "above-ceiling": "over the per-payout ceiling",
  "daily-ceiling": "today's ceiling is reached",
  "recently-failed": "a payout to them failed in the last 24 hours",
};

/** "Run now": settle payouts still on their way, and send one that is owed. The same pass a confirmed delivery starts. */
export async function runAutoPayoutsAction(): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { runAutoPayouts } = await import("@/server/money/auto-payouts");
    const run = await runAutoPayouts();
    revalidateMoney();

    const parts: string[] = [];
    if (run.settled.length) parts.push(`${run.settled.length} earlier payout${run.settled.length === 1 ? "" : "s"} settled.`);
    if (run.skipped === "off") parts.push("Automatic payouts are not switched on for this site, so nothing new was sent.");
    else if (run.skipped === "paused") parts.push("Automatic payouts are paused, so nothing new was sent.");
    else if (run.sent) {
      const amount = `TSh ${run.sent.amountTZS.toLocaleString("en-US")}`;
      const said: Record<typeof run.sent.result, string> = {
        paid: `Sent ${amount} to ${run.sent.payee}.`,
        sending: `${amount} to ${run.sent.payee} is on its way; ClickPesa has not confirmed it yet.`,
        unknown: `Asked ClickPesa to send ${amount} to ${run.sent.payee} but got no clear answer. It is held as "sending" and will not be sent twice.`,
        refused: `ClickPesa would not send ${amount} to ${run.sent.payee}. Nothing left the account; it is owed again.`,
        "insufficient-balance": `ClickPesa's balance cannot cover ${amount} to ${run.sent.payee}. Nothing was sent.`,
      };
      parts.push(said[run.sent.result]);
    } else parts.push("Nothing to send right now.");
    for (const left of run.leftForAdmin) {
      parts.push(`${left.payee} left for you: ${SKIP_WORDS[left.reason] ?? left.reason}.`);
    }
    if (!run.skipped && run.sent && (run.sent.result === "paid" || run.sent.result === "sending")) {
      parts.push("ClickPesa allows one payout a minute, so press again in a minute if more are owed.");
    }
    const failed = run.sent && (run.sent.result === "refused" || run.sent.result === "insufficient-balance" || run.sent.result === "unknown");
    return { status: failed ? "error" : "ok", message: parts.join(" ") };
  } catch (error) {
    await logServerError("run-auto-payouts", error, session.uid);
    return FAILED;
  }
}

/** What ClickPesa really holds, beside what the books say it should. One API call. */
export async function compareBalanceAction(): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  try {
    const { compareBooksWithClickPesa } = await import("@/server/money/auto-payouts");
    const check = await compareBooksWithClickPesa();
    if (!check.ok) return { status: "error", message: `Couldn't read the ClickPesa balance: ${check.reason}` };
    const tsh = (n: number) => `TSh ${Math.round(n).toLocaleString("en-US")}`;
    const head = `ClickPesa holds ${tsh(check.clickpesaTZS)}. The books say ${tsh(check.booksTZS)} should be held.`;
    if (check.differenceTZS === 0) return { status: "ok", message: `${head} They match.` };
    return {
      status: check.differenceTZS < 0 ? "error" : "ok",
      message:
        check.differenceTZS < 0
          ? `${head} ClickPesa is ${tsh(-check.differenceTZS)} short of the books — ClickPesa's own fees, or money moved outside MalFleks. Find out which before paying anyone.`
          : `${head} ClickPesa has ${tsh(check.differenceTZS)} more than the books — money added outside MalFleks, or a payment not yet recorded.`,
    };
  } catch (error) {
    await logServerError("compare-balance", error, session.uid);
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
    revalidateSitePath("/partner");
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
  revalidateSitePath("/");
  revalidateSitePath("/brands", "layout");
  revalidateSitePath("/products", "layout");
  revalidateSitePath("/delivery", "layout");
  revalidateSitePath("/search");
  revalidateSitePath("/locator");
  revalidateSitePath("/partner");
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

/**
 * "Documents checked": a person has read this shop's licence, TIN certificate
 * and shop-front photo and found them in order. The shop shows as verified to
 * customers from now on, and anything the verification rule hid comes back.
 */
export async function markShopVerifiedAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const partnerId = field(formData, "partnerId");
  try {
    const { markShopVerified } = await import("@/server/partners/verification");
    const outcome = await markShopVerified(partnerId, session.uid);
    if (!outcome.ok) {
      const messages: Record<typeof outcome.reason, string> = {
        "not-found": "This partner no longer exists.",
        "not-a-shop": "Only shops are verified this way. Couriers are approved, not verified.",
        "documents-missing": "All three documents have to be here first: business licence, TIN certificate and shop-front photo.",
        "already-verified": "Already marked as checked.",
      };
      return { status: "error", message: messages[outcome.reason] };
    }
    revalidatePath(`/admin/partners/${partnerId}`);
    revalidatePath("/admin/partners");
    revalidatePath("/admin/rules");
    revalidatePath("/admin");
    revalidateSitePath("/partner");
    // The "Verified shop" mark is on public pages.
    await notifyPublicSiteOfCatalogueChange();
    return {
      status: "ok",
      message: outcome.restoreFailed
        ? "Marked as checked. Its hidden products couldn't be put back just now — the rulebook will finish that on its next run, within 15 minutes."
        : outcome.restored > 0
          ? `Marked as checked. ${outcome.restored} hidden product${outcome.restored === 1 ? " is" : "s are"} back on the shop.`
          : "Marked as checked. Customers now see this shop as verified.",
    };
  } catch (error) {
    await logServerError("mark-shop-verified", error, session.uid);
    return FAILED;
  }
}
