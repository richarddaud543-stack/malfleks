"use client";

import { useState, useTransition } from "react";

import {
  confirmOrderByBranchAction,
  declineOrderByBranchAction,
} from "@/app/actions/partner-orders";

/** Mirrors `MIN_DECLINE_REASON_LENGTH` on the server, which is the one that counts. */
import { useLocale } from "@/i18n/client";
import { PARTNER } from "@/i18n/copy/partner";

type DecideCopy = (typeof PARTNER)["en"]["decide"];

const MIN_REASON_LENGTH = 3;

function errorMessage(reason: string | undefined, copy: DecideCopy): string {
  switch (reason) {
    case "invalid-transition":
      return copy.already;
    case "not-found":
      return copy.notFound;
    case "partner-suspended":
      return copy.suspended;
    case "reason-required":
      return copy.reasonRequired;
    case "signed-out":
      return copy.signedOut;
    default:
      return copy.failed;
  }
}

/**
 * The branch's answer to a new order: "we have it", or "we can't".
 *
 * Shown only on a `pending` order, and only to the partner who owns the branch
 * it was sent to — the page decides that from the session, and the action
 * proves it again from the database (`branch-decisions.ts`), so hiding these
 * buttons is a courtesy, not the control.
 *
 * Confirming is one press: it is the answer the customer is waiting for, and
 * it asks them to pay, not you to do anything irreversible. Declining is two
 * steps and needs a reason, the same shape as every other destructive control
 * here — armed, then confirmed, no `window.confirm()` — because it ends the
 * order and the reason is emailed to the customer as written.
 */
export default function BranchDecisionButtons({
  orderId,
  reference,
  paid = false,
}: {
  orderId: string;
  reference: string;
  /**
   * The customer has already paid (the usual case since 3 Oct 2026: paying is
   * what confirms an order). There is then nothing to confirm -- only
   * "Can't fulfil" is offered, and it says a refund follows.
   */
  paid?: boolean;
}) {
  const copy = PARTNER[useLocale()].decide;
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<"confirmed" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= MIN_REASON_LENGTH;

  if (done) {
    return (
      <p role="status" className="mt-4 text-sm font-medium text-accent">
        {done === "confirmed"
          ? copy.doneConfirmed
          : paid
            ? copy.doneDeclinedPaid
            : copy.doneDeclined}
      </p>
    );
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmOrderByBranchAction(orderId);
      if (result.ok) setDone("confirmed");
      else setError(errorMessage(result.reason, copy));
    });
  }

  function decline() {
    if (!reasonOk) {
      setError(errorMessage("reason-required", copy));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await declineOrderByBranchAction(orderId, trimmed);
      if (result.ok) {
        setDone("declined");
      } else {
        if (result.reason !== "reason-required") setMode("idle");
        setError(errorMessage(result.reason, copy));
      }
    });
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      {mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          {!paid && <button
            type="button"
            disabled={pending}
            onClick={confirm}
            aria-label={copy.confirmLabel(reference)}
            className="min-h-11 rounded-full border border-accent bg-accent px-5 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? copy.confirming : copy.confirm}
          </button>}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMode("declining");
            }}
            aria-label={copy.cantLabel(reference)}
            className="min-h-11 rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.cant}
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor={`decline-${orderId}`} className="block text-sm font-medium">
            {copy.why}
          </label>
          <p className="mt-1 text-xs text-muted">
            {copy.whyHint}{" "}
            {paid
              ? copy.whyPaid
              : copy.whyUnpaid}
          </p>
          <input
            id={`decline-${orderId}`}
            type="text"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm outline-none hover:border-foreground/30"
          />
          <div className="mt-3 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setMode("idle");
              }}
              className="min-h-11 rounded-full border border-border px-5 py-2 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.back}
            </button>
            <button
              type="button"
              disabled={pending || !reasonOk}
              onClick={decline}
              aria-label={copy.yesDeclineLabel(reference)}
              className="min-h-11 rounded-full border border-red-600 px-5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted"
            >
              {pending ? copy.declining : copy.yesDecline}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
