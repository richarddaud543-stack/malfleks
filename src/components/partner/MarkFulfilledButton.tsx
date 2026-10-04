"use client";

import { useState, useTransition } from "react";

import { markOrderFulfilledByPartnerAction } from "@/app/actions/partner-orders";

function errorMessage(reason: string | undefined): string {
  switch (reason) {
    case "invalid-transition":
      return "This order already moved — reload to see its current state.";
    case "not-found":
      return "This order can't be marked from here.";
    case "not-paid":
      return "The customer hasn't paid for this order yet, so it can't be marked delivered. Don't hand anything over until it says “Paid through MalFleks”.";
    default:
      return "Couldn't record that. Nothing changed — try again.";
  }
}

/**
 * "Mark delivered" — the one status button `/partner/orders` gets. See the
 * doc comment on `markOrderFulfilledByPartner` (`server/orders/status.ts`)
 * for why this is the only transition a partner may make themselves.
 *
 * Two-step, same pattern as the admin console's `OrderCard`: armed, then
 * confirmed, no `window.confirm()`. There is no "undo" here because there is
 * none server-side either — `fulfilled` is terminal.
 */
export default function MarkFulfilledButton({ orderId }: { orderId: string }) {
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="mt-4 text-xs font-medium text-accent">
        Marked delivered.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="min-h-11 rounded-full border border-accent px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
        >
          Mark delivered
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Confirm this arrived?</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className="min-h-11 rounded-full border border-border px-4 py-2 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markOrderFulfilledByPartnerAction(orderId);
                if (result.ok) {
                  setDone(true);
                } else {
                  setArmed(false);
                  setError(errorMessage(result.reason));
                }
              })
            }
            className="min-h-11 rounded-full border border-accent bg-accent px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Marking…" : "Yes, delivered"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
