"use client";

import { useState, useTransition } from "react";
import { deleteOrderRequest } from "@/app/actions/order-requests";
import { useLocale } from "@/i18n/client";
import { ACCOUNT } from "@/i18n/copy/account";

/**
 * The control that lets a customer take their own details back out of the
 * database — the missing half of the save path, and the point of debt #20.
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
  blocked = null,
}: {
  id: string;
  reference: string;
  /**
   * Set while the order behind this request is confirmed: `"unpaid"` when
   * the customer still has to pay, `"undelivered"` when they have and it is
   * on its way. The card is then their only way back to the Pay and Track
   * pages, so there is no Remove button — only why. The Server Action
   * refuses in the same states, so this is the explanation, not the control.
   */
  blocked?: "unpaid" | "undelivered" | null;
}) {
  const copy = ACCOUNT[useLocale()].remove;
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (blocked) {
    return (
      <div className="mt-5 w-full border-t border-border pt-4">
        <p className="text-sm text-muted">
          {blocked === "unpaid"
            ? copy.blockedUnpaid
            : copy.blockedUndelivered}{" "}
          {copy.after}
        </p>
      </div>
    );
  }

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
          ? copy.signedOut
          : result.reason === "not-found"
            ? copy.notFound
            : result.reason === "order-in-progress"
              ? copy.inProgress
              : copy.failed
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
            {copy.confirm}
          </span>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={pending}
            className="min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            {copy.keep}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            aria-label={copy.yesLabel(reference)}
            className="min-h-11 rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            {pending ? copy.removing : copy.yes}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          aria-label={copy.removeLabel(reference)}
          className="min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
        >
          {copy.remove}
        </button>
      )}
    </div>
  );
}
