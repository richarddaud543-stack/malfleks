"use client";

import { useActionState } from "react";

import {
  checkAllPaymentsAction,
  checkPaymentAction,
  type CheckAllState,
  type CheckState,
} from "@/app/actions/reconcile";

/** What a check found, in words an operator acts on. */
function describe(state: CheckState): { text: string; good?: boolean; bad?: boolean } | null {
  if (state.status === "idle") return null;
  if (state.status === "error") return { text: state.message, bad: true };
  switch (state.outcome) {
    case "captured":
      return { text: "Captured — the money is in the ledger.", good: true };
    case "already-captured":
      return { text: "Already recorded.", good: true };
    case "amount-mismatch":
      return { text: "ClickPesa reports a different amount. Not recorded — see Recent errors.", bad: true };
    case "check-failed":
      return { text: "Couldn't reach ClickPesa. Logged — try again shortly.", bad: true };
    case "waiting":
      switch (state.providerStatus) {
        case "NO_ATTEMPTS":
          return { text: "Not paid yet — no attempt at ClickPesa." };
        case "FAILED":
          return { text: "The customer's attempt failed. Still open for a retry." };
        case "SUCCESS_WITHOUT_AMOUNT":
          return { text: "ClickPesa reports success with no amount — not recorded.", bad: true };
        default:
          return { text: `In progress at ClickPesa (${state.providerStatus ?? "unknown"}).` };
      }
  }
}

export function CheckPaymentButton({ paymentId }: { paymentId: string }) {
  const [state, action, pending] = useActionState<CheckState, FormData>(checkPaymentAction, { status: "idle" });
  const said = describe(state);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="paymentId" value={paymentId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent disabled:opacity-60"
      >
        {pending ? "Checking…" : "Check now"}
      </button>
      <p aria-live="polite" className={`max-w-56 text-right text-xs ${said?.bad ? "text-[#9b1c1c]" : said?.good ? "text-[#006300]" : "text-muted"}`}>
        {said?.text}
      </p>
    </form>
  );
}

export function CheckAllPaymentsButton({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState<CheckAllState, FormData>(checkAllPaymentsAction, { status: "idle" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Asking ClickPesa…" : "Check all open payments"}
      </button>
      <p aria-live="polite" className="text-sm text-muted">
        {state.status === "error" && <span className="text-[#9b1c1c]">{state.message}</span>}
        {state.status === "done" &&
          (state.checked === 0
            ? "Nothing due — every open payment was checked in the last two minutes."
            : `Checked ${state.checked}: ${state.captured} captured${state.failed ? `, ${state.failed} couldn't be reached` : ""}.`)}
      </p>
    </form>
  );
}
