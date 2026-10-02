"use client";

import { useState, useTransition } from "react";

import {
  confirmOrderByBranchAction,
  declineOrderByBranchAction,
} from "@/app/actions/partner-orders";

/** Mirrors `MIN_DECLINE_REASON_LENGTH` on the server, which is the one that counts. */
const MIN_REASON_LENGTH = 3;

function errorMessage(reason: string | undefined): string {
  switch (reason) {
    case "invalid-transition":
      return "This order was already answered — reload to see where it stands.";
    case "not-found":
      return "This order can't be answered from here.";
    case "partner-suspended":
      return "Your account is suspended, so you can't answer orders. Contact MalFleks.";
    case "reason-required":
      return "Say why in a few words — the customer is told.";
    case "signed-out":
      return "Your session has expired. Sign in again.";
    default:
      return "Couldn't record that. Nothing changed — try again.";
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
}: {
  orderId: string;
  reference: string;
}) {
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
          ? "Confirmed. The customer has been asked to pay — wait for “Paid through MalFleks” before you hand anything over."
          : "Declined. The customer has been told."}
      </p>
    );
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmOrderByBranchAction(orderId);
      if (result.ok) setDone("confirmed");
      else setError(errorMessage(result.reason));
    });
  }

  function decline() {
    if (!reasonOk) {
      setError(errorMessage("reason-required"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await declineOrderByBranchAction(orderId, trimmed);
      if (result.ok) {
        setDone("declined");
      } else {
        if (result.reason !== "reason-required") setMode("idle");
        setError(errorMessage(result.reason));
      }
    });
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      {mode === "idle" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={confirm}
            aria-label={`Confirm ${reference} — we have it at this price`}
            className="min-h-11 rounded-full border border-accent bg-accent px-5 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Confirming…" : "Confirm — we have it at this price"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMode("declining");
            }}
            aria-label={`Can't fulfil ${reference}`}
            className="min-h-11 rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Can&apos;t fulfil
          </button>
        </div>
      ) : (
        <div>
          <label htmlFor={`decline-${orderId}`} className="block text-sm font-medium">
            Why can&apos;t you fulfil it?
          </label>
          <p className="mt-1 text-xs text-muted">
            The customer is emailed this as you write it — for example “Out of
            stock until next week”. They have not paid anything.
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
              Back
            </button>
            <button
              type="button"
              disabled={pending || !reasonOk}
              onClick={decline}
              aria-label={`Yes, decline ${reference}`}
              className="min-h-11 rounded-full border border-red-600 px-5 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted"
            >
              {pending ? "Declining…" : "Yes, decline this order"}
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
