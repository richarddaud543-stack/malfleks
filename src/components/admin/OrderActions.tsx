"use client";

import { useState, useTransition } from "react";
import {
  cancelOrder,
  confirmOrder,
  markOrderFulfilled,
  sendPaymentLink,
} from "@/app/actions/orders";
import type { ListedOrder } from "@/server/orders/list-orders";

/** What the controls need to know about an order. */
export type ActionableOrder = Pick<ListedOrder, "id" | "reference" | "status" | "payment">;

/**
 * The status-appropriate controls for one order, shown on its own page
 * (`/admin/orders/[id]`). Until 2 Oct 2026 these lived inside `OrderCard`,
 * which also rendered the whole order as a card in the list; the list became
 * a table and the order got a page of its own, so the controls stand alone.
 *
 * Mirrors `ApplicationReviewCard`'s shape: every state-changing action is
 * two-step (armed, then confirmed) and per-card, cancelling asks for a
 * reason inline, `useTransition` drives the pending state, and nothing here
 * uses `window.confirm()` — unstyled, unannounced, and it blocks the tab.
 *
 * One deliberate departure from `ApplicationReviewCard`'s literal labels:
 * the domain action here is itself called "Cancel", so the *abort this
 * sub-flow* button is labelled "Back" instead of reusing "Cancel" — reusing
 * it would put two buttons meaning different things on screen with the same
 * name in the cancelling flow.
 */

type Mode = "idle" | "confirming" | "fulfilling" | "cancelling" | "paying";

function paymentErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case "wrong-status":
      return "Only a confirmed order can be sent a payment link.";
    case "unquotable":
      return "No delivery fee is set for this route yet, so there's no total to charge.";
    case "already-paid":
      return "This order is already paid.";
    case "checkout-link-failed":
      return "ClickPesa didn't return a checkout link. Try again in a moment.";
    case "not-found":
      return "This order no longer exists.";
    case "forbidden":
      return "Your session no longer has admin access. Sign in again.";
    default:
      return "Couldn't create a payment link. Nothing changed — try again.";
  }
}

function errorMessage(reason: string | undefined): string {
  switch (reason) {
    case "forbidden":
      return "Your session no longer has admin access. Sign in again.";
    case "invalid-transition":
      return "Someone already moved this order. Reload to see its current state.";
    case "not-found":
      return "This order no longer exists.";
    default:
      return "Couldn't record the decision. Nothing changed — try again.";
  }
}

export default function OrderActions({ order }: { order: ActionableOrder }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(
    order.payment?.status === "pending" ? order.payment.checkoutLink : null
  );
  const [pending, startTransition] = useTransition();

  function run(work: () => Promise<{ ok: boolean; reason?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setMode("idle");
      if (result.ok) return; // revalidatePath refreshes the badge and controls
      setError(errorMessage(result.reason));
    });
  }

  function runPayment() {
    setError(null);
    startTransition(async () => {
      const result = await sendPaymentLink(order.id);
      setMode("idle");
      if (result.ok) {
        setPaymentLink(result.checkoutLink);
        return;
      }
      setError(paymentErrorMessage(result.reason));
    });
  }

  const canAct = order.status === "pending" || order.status === "confirmed";
  const trimmedReason = reason.trim();

  return (
    <div>
      {paymentLink && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs text-muted">
            Payment link. The customer already has it on their checkout page
            and by email — copy it only if you want to send it another way
            (SMS/WhatsApp).
          </p>
          <p className="mt-1.5 break-all font-mono text-xs text-foreground select-all">
            {paymentLink}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {canAct && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {mode === "idle" && order.status === "pending" && (
            <>
              <button
                type="button"
                onClick={() => setMode("confirming")}
                aria-label={`Confirm ${order.reference}`}
                className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setMode("cancelling")}
                aria-label={`Cancel ${order.reference}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
              >
                Cancel
              </button>
              <span className="ml-auto text-xs text-muted">
                Confirming opens the customer&apos;s checkout and emails them the link.
              </span>
            </>
          )}

          {mode === "idle" && order.status === "confirmed" && (
            <>
              <button
                type="button"
                onClick={() => setMode("fulfilling")}
                aria-label={`Mark ${order.reference} fulfilled`}
                className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
              >
                Mark fulfilled
              </button>
              {order.payment?.status !== "captured" && (
                <button
                  type="button"
                  onClick={() => setMode("paying")}
                  aria-label={`Send a payment link for ${order.reference}`}
                  className="rounded-full border border-accent-2 px-4 py-1.5 text-sm font-medium text-accent-2 transition-colors hover:bg-accent-2 hover:text-background"
                >
                  {order.payment?.status === "pending"
                    ? "View payment link"
                    : "Send payment link"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("cancelling")}
                aria-label={`Cancel ${order.reference}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
              >
                Cancel
              </button>
            </>
          )}

          {mode === "paying" && (
            <>
              <span className="mr-auto text-sm text-muted">
                Show the ClickPesa payment link for {order.reference}? One is
                made if the automatic one didn&apos;t go through.
              </span>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={runPayment}
                aria-label={`Yes, create a payment link for ${order.reference}`}
                className="rounded-full border border-accent-2 bg-accent-2 px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "Creating…" : "Yes, create link"}
              </button>
            </>
          )}

          {mode === "confirming" && (
            <>
              <span className="mr-auto text-sm text-muted">
                Confirm {order.reference} is available at the quoted price? The
                customer is then asked to pay.
              </span>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => confirmOrder(order.id))}
                aria-label={`Yes, confirm ${order.reference}`}
                className="rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "Confirming…" : "Yes, confirm"}
              </button>
            </>
          )}

          {mode === "fulfilling" && (
            <>
              <span className="mr-auto text-sm text-muted">
                Mark {order.reference} as delivered / handed off?
                {order.payment?.status === "captured" &&
                  " The money held for it is then split into what the branch and courier are owed."}
              </span>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => markOrderFulfilled(order.id))}
                aria-label={`Yes, mark ${order.reference} fulfilled`}
                className="rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "Marking…" : "Yes, mark fulfilled"}
              </button>
            </>
          )}

          {mode === "cancelling" && (
            <div className="w-full">
              <label
                htmlFor={`cancel-reason-${order.id}`}
                className="block text-sm font-medium"
              >
                Why is this being cancelled?
              </label>
              <p className="mt-1 text-xs text-muted">
                Stored with the decision — out of stock, branch declined, or
                the customer was unreachable or withdrew.
              </p>
              <input
                id={`cancel-reason-${order.id}`}
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm outline-none hover:border-foreground/30"
              />
              <div className="mt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setReason("");
                  }}
                  disabled={pending}
                  className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={pending || trimmedReason === ""}
                  onClick={() => run(() => cancelOrder(order.id, reason))}
                  aria-label={`Confirm cancellation of ${order.reference}`}
                  className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
                >
                  {pending ? "Cancelling…" : "Cancel order"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
