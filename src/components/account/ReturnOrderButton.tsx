"use client";

import { useState, useTransition } from "react";

import { returnOwnOrderAction } from "@/app/actions/customer-orders";
import { useLocale } from "@/i18n/client";
import { ACCOUNT } from "@/i18n/copy/account";

type ReturnCopy = (typeof ACCOUNT)["en"]["returns"];

function errorMessage(reason: string, copy: ReturnCopy): string {
  switch (reason) {
    case "signed-out":
      return copy.signedOut;
    case "not-found":
      return copy.notFound;
    case "not-delivered":
      return copy.notDelivered;
    case "too-late":
      return copy.tooLate;
    case "already-asked":
      return copy.alreadyAsked;
    default:
      return copy.failed;
  }
}

/**
 * "Return this order": the customer's 7-day right after delivery (Electronic
 * Transactions Act s.30), made into a button rather than left as a sentence in
 * the Terms.
 *
 * Shown only while the window is open (`returnWindowOpen`, decided by the
 * server-rendered card) and checked again by the server, which is the one that
 * counts. Two steps and no `window.confirm()`, the same pattern as
 * `CancelOrderButton` beside it; the first step says the three conditions so
 * nobody returns something believing it is free.
 */
export default function ReturnOrderButton({ reference, until }: { reference: string; until?: string }) {
  const copy = ACCOUNT[useLocale()].returns;
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
      try {
        const result = await returnOwnOrderAction(reference);
        if (result.ok) {
          setAsked(true);
          return;
        }
        setArmed(false);
        setError(errorMessage(result.reason, copy));
      } catch {
        // The request itself failed (offline, a deploy mid-flight): nothing was asked.
        setArmed(false);
        setError(copy.failed);
      }
    });
  }

  return (
    <div className="mt-4 flex w-full flex-wrap items-center gap-3">
      {armed ? (
        <>
          <span className="mr-auto text-sm text-muted">{copy.confirm}</span>
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
            aria-label={copy.yesLabel(reference)}
            className="min-h-11 rounded-full border border-foreground/30 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-50"
          >
            {pending ? copy.working : copy.yes}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setArmed(true);
            }}
            aria-label={copy.askLabel(reference)}
            className="min-h-11 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {copy.ask}
          </button>
          {until && <span className="text-xs text-muted">{copy.until(until)}</span>}
        </>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
