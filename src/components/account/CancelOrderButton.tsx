"use client";

import { useState, useTransition } from "react";

import { cancelOwnOrderAction } from "@/app/actions/customer-orders";

function errorMessage(reason: string): string {
  switch (reason) {
    case "signed-out":
      return "Your session has expired. Sign in again to cancel this order.";
    case "too-late":
      return "This order has changed since the page loaded. Reload to see where it stands.";
    case "already-asked":
      return "You have already asked us to cancel this order. We will reply by email.";
    case "not-found":
      return "We couldn't find this order on your account.";
    default:
      return "We couldn't do that just now. Nothing was changed — try again in a moment.";
  }
}

/**
 * The customer's own way out of an order.
 *
 * `paid` decides which of two different things this is, and the words say so:
 *
 * - not paid: "Cancel this order" really cancels it, there and then;
 * - paid: "Ask to cancel" passes the request to MalFleks and changes nothing
 *   yet, because what is refunded has to be decided by a person.
 *
 * Two steps and no `window.confirm()`, the same pattern as
 * `DeleteSavedRequest` beside it.
 */
export default function CancelOrderButton({ reference, paid }: { reference: string; paid: boolean }) {
  const [armed, setArmed] = useState(false);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (asked) {
    return (
      <p role="status" className="mt-4 w-full text-sm text-muted">
        We have passed this on. Nothing is cancelled yet — a person at MalFleks will check with the shop and email you
        about the order and your refund.
      </p>
    );
  }

  function go() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOwnOrderAction(reference);
      if (result.ok) {
        // A real cancellation revalidates /account and this card redraws as
        // cancelled. A request leaves the order as it was, so say what happened.
        if (result.kind === "requested") setAsked(true);
        return;
      }
      setArmed(false);
      setError(errorMessage(result.reason));
    });
  }

  return (
    <div className="mt-4 flex w-full flex-wrap items-center gap-3">
      {armed ? (
        <>
          <span className="mr-auto text-sm text-muted">
            {paid
              ? "Ask MalFleks to cancel this paid order?"
              : "Cancel this order? You have not been charged for it."}
          </span>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={pending}
            className="min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={go}
            disabled={pending}
            aria-label={paid ? `Yes, ask to cancel order ${reference}` : `Yes, cancel order ${reference}`}
            className="min-h-11 rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            {pending ? "Working…" : paid ? "Yes, ask" : "Yes, cancel"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          aria-label={paid ? `Ask to cancel order ${reference}` : `Cancel order ${reference}`}
          className="min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
        >
          {paid ? "Ask to cancel" : "Cancel this order"}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
