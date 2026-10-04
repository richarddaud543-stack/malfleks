"use client";

import { useState, useTransition } from "react";

import { markOrderFulfilledByPartnerAction } from "@/app/actions/partner-orders";
import { useLocale } from "@/i18n/client";
import { PARTNER } from "@/i18n/copy/partner";

type FulfilCopy = (typeof PARTNER)["en"]["fulfil"];

function errorMessage(reason: string | undefined, copy: FulfilCopy): string {
  switch (reason) {
    case "invalid-transition":
      return copy.already;
    case "not-found":
      return copy.notFound;
    case "not-paid":
      return copy.notPaid;
    default:
      return copy.failed;
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
  const copy = PARTNER[useLocale()].fulfil;
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="mt-4 text-xs font-medium text-accent">
        {copy.done}
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
          {copy.mark}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{copy.confirm}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className="min-h-11 rounded-full border border-border px-4 py-2 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.back}
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
                  setError(errorMessage(result.reason, copy));
                }
              })
            }
            className="min-h-11 rounded-full border border-accent bg-accent px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? copy.marking : copy.yes}
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
