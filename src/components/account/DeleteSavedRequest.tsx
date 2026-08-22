"use client";

import { useState, useTransition } from "react";
import { deleteOrderRequest } from "@/app/actions/order-requests";

/**
 * The control that lets a customer take their own details back out of
 * Firestore — the missing half of the save path, and the point of debt #20.
 *
 * Two steps rather than one, and deliberately not `window.confirm()`. A native
 * confirm is unstyled, unannounced in the page's own live region, and blocks
 * the whole tab; an inline confirm is a normal focusable control that a screen
 * reader reads in place. The armed state is local to this card, so two cards
 * cannot both be armed by one stray Enter.
 *
 * The label carries the reference because "Remove" on its own is the same
 * accessible name on every card in the list — fine to look at, useless to
 * anyone navigating by control.
 */
export default function DeleteSavedRequest({
  id,
  reference,
}: {
  id: string;
  reference: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOrderRequest(id);
      if (result.deleted) {
        // No local state change on success: the action revalidates /account
        // and this card goes with it. Setting state here would be a race
        // against its own unmount.
        return;
      }
      setArmed(false);
      setError(
        result.reason === "signed-out"
          ? "Your session has expired. Sign in again to remove this request."
          : result.reason === "not-found"
            ? "This request has already been removed."
            : "We couldn't remove this request. Nothing was changed — try again in a moment."
      );
    });
  }

  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
      {/* Errors are announced, not just coloured. `role="alert"` rather than a
          polite region: the customer asked for a deletion and it did not
          happen, which is worth interrupting for. */}
      {error && (
        <p role="alert" className="mr-auto text-sm text-red-600">
          {error}
        </p>
      )}

      {armed ? (
        <>
          <span className="mr-auto text-sm text-muted">
            Remove this request permanently?
          </span>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={pending}
            className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            aria-label={`Yes, permanently remove request ${reference}`}
            className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            {pending ? "Removing…" : "Yes, remove"}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          aria-label={`Remove request ${reference}`}
          className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
        >
          Remove
        </button>
      )}
    </div>
  );
}
