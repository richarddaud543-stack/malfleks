"use server";

import { revalidatePath } from "next/cache";

import { adminSession } from "@/server/auth/admin-session";
import { logServerError } from "@/server/error-log";
import { reconcileDue, reconcilePayment, type ReconcileOutcome } from "@/server/payments/reconcile";

/**
 * The Money page's "Check now" buttons.
 *
 * Re-checks admin itself: a Server Action is a public endpoint, and the page
 * that renders the button is not its gate (see `adminSession`).
 */

export type CheckState =
  | { status: "idle" }
  | { status: "done"; outcome: ReconcileOutcome; providerStatus: string | null }
  | { status: "error"; message: string };

export async function checkPaymentAction(_previous: CheckState, formData: FormData): Promise<CheckState> {
  const session = await adminSession();
  if (!session) return { status: "error", message: "Not allowed." };

  const paymentId = formData.get("paymentId");
  if (typeof paymentId !== "string" || paymentId.length === 0) {
    return { status: "error", message: "No payment given." };
  }

  try {
    const result = await reconcilePayment(paymentId);
    if (!result) return { status: "error", message: "That payment no longer exists." };
    revalidatePath("/admin/money");
    revalidatePath("/admin");
    return { status: "done", outcome: result.outcome, providerStatus: result.providerStatus };
  } catch (error) {
    await logServerError("clickpesa-reconcile-action", error, session.uid);
    return { status: "error", message: "The check failed. It has been logged." };
  }
}

export type CheckAllState =
  | { status: "idle" }
  | { status: "done"; checked: number; captured: number; failed: number }
  | { status: "error"; message: string };

// Takes no arguments: useActionState passes the previous state and the form
// data, and this action needs neither.
export async function checkAllPaymentsAction(): Promise<CheckAllState> {
  const session = await adminSession();
  if (!session) return { status: "error", message: "Not allowed." };

  try {
    // Two minutes, not thirty: an admin pressing the button wants an answer
    // now. But not zero -- pressing it five times in a row should not spend
    // five checks per payment of a 100-a-day budget.
    const results = await reconcileDue({ staleAfterMinutes: 2, limit: 10 });
    revalidatePath("/admin/money");
    revalidatePath("/admin");
    return {
      status: "done",
      checked: results.length,
      captured: results.filter((r) => r.outcome === "captured").length,
      failed: results.filter((r) => r.outcome === "check-failed").length,
    };
  } catch (error) {
    await logServerError("clickpesa-reconcile-action", error, session.uid);
    return { status: "error", message: "The check failed. It has been logged." };
  }
}
