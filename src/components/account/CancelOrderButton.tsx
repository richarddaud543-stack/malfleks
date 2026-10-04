"use client";

import { useState, useTransition } from "react";

import { cancelOwnOrderAction } from "@/app/actions/customer-orders";
import { useLocale } from "@/i18n/client";
import { ACCOUNT } from "@/i18n/copy/account";

type CancelCopy = (typeof ACCOUNT)["en"]["cancel"];

function errorMessage(reason: string, copy: CancelCopy): string {
  switch (reason) {
    case "signed-out":
      return copy.signedOut;
    case "too-late":
      return copy.tooLate;
    case "already-asked":
      return copy.alreadyAsked;
    case "not-found":
      return copy.notFound;
    default:
      return copy.failed;
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
  const copy = ACCOUNT[useLocale()].cancel;
  const [armed, setArmed] = useState(false);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (asked) {
    return (
      <p role="status" className="mt-4 w-full text-sm text-muted">
        {copy.passedOn}
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
      setError(errorMessage(result.reason, copy));
    });
  }

  return (
    <div className="mt-4 flex w-full flex-wrap items-center gap-3">
      {armed ? (
        <>
          <span className="mr-auto text-sm text-muted">
            {paid
              ? copy.askPaid
              : copy.askUnpaid}
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
            onClick={go}
            disabled={pending}
            aria-label={paid ? copy.yesAskLabel(reference) : copy.yesCancelLabel(reference)}
            className="min-h-11 rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            {pending ? copy.working : paid ? copy.yesAsk : copy.yesCancel}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          aria-label={paid ? copy.askLabel(reference) : copy.cancelLabel(reference)}
          className="min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
        >
          {paid ? copy.ask : copy.cancel}
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
