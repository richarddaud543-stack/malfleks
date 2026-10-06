"use client";

import { useId, useState, useTransition } from "react";

import { confirmDeliveryWithCodeAction, reportDeliveryProblemAction } from "@/app/actions/partner-orders";
import { useLocale } from "@/i18n/client";
import { PARTNER } from "@/i18n/copy/partner";

type DeliverCopy = (typeof PARTNER)["en"]["deliver"];

/** The state of this order's code, as the page read it. Never the code itself. */
export interface DeliveryCodeFormState {
  lockedUntil: string | null;
  adminOnly: boolean;
  problemReported: boolean;
}

function clock(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * How a branch or courier confirms a delivery: by typing the six-digit code
 * the customer tells them once the goods are in the customer's hands.
 *
 * This replaced "Mark delivered" on 5 Oct 2026. That button let the person who
 * is paid for a delivery be the only one to say it happened. Now the customer
 * says it, by handing over the code -- see `src/server/orders/delivery-code.ts`.
 *
 * Underneath is the way out for when the code cannot be had (a dead phone, a
 * lost code): "I can't enter the code", with a reason. That pays nobody; it
 * hands the order to MalFleks to settle.
 *
 * The input is `inputMode="numeric"` with `autoComplete="one-time-code"`, so a
 * phone shows the number pad. It is not `type="number"`: a code can start with
 * zero, and a number field would drop it.
 */
export default function DeliveryCodeForm({
  orderId,
  reference,
  initial,
}: {
  orderId: string;
  reference: string;
  initial: DeliveryCodeFormState;
}) {
  const locale = useLocale();
  const copy: DeliverCopy = PARTNER[locale].deliver;
  const dateLocale = PARTNER[locale].dateLocale;
  const codeId = useId();
  const noteId = useId();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(initial.problemReported);
  const [lockedUntil, setLockedUntil] = useState<string | null>(initial.lockedUntil);
  const [adminOnly, setAdminOnly] = useState(initial.adminOnly);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p role="status" className="mt-4 rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm font-medium">
        {copy.done}
      </p>
    );
  }

  const submitCode = () =>
    startTransition(async () => {
      setError(null);
      const result = await confirmDeliveryWithCodeAction(orderId, code);
      if (result.ok) {
        setDone(true);
        return;
      }
      setCode("");
      switch (result.reason) {
        case "wrong-code":
          setLockedUntil(result.lockedUntil);
          setAdminOnly(result.adminOnly);
          setError(
            result.adminOnly
              ? copy.lockedAdmin
              : result.lockedUntil
                ? copy.wrongLocked(clock(result.lockedUntil, dateLocale))
                : copy.wrong(result.triesLeft),
          );
          break;
        case "locked":
          setLockedUntil(result.lockedUntil);
          setError(copy.locked(clock(result.lockedUntil, dateLocale)));
          break;
        case "locked-admin":
          setAdminOnly(true);
          setError(copy.lockedAdmin);
          break;
        case "bad-code":
          setError(copy.badCode);
          break;
        case "not-paid":
          setError(copy.notPaid);
          break;
        case "invalid-transition":
          setError(copy.already);
          break;
        case "not-found":
          setError(copy.notFound);
          break;
        case "signed-out":
          setError(copy.signedOut);
          break;
        default:
          setError(copy.failed);
      }
    });

  const submitProblem = () =>
    startTransition(async () => {
      setError(null);
      const result = await reportDeliveryProblemAction(orderId, note);
      if (result.ok || result.reason === "already-reported") {
        setReported(true);
        setReporting(false);
        return;
      }
      setError(
        result.reason === "note-required"
          ? copy.noteRequired
          : result.reason === "invalid-transition"
            ? copy.already
            : result.reason === "signed-out"
              ? copy.signedOut
              : copy.failed,
      );
    });

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-4">
      <label htmlFor={codeId} className="block text-sm font-medium">
        {copy.label}
      </label>
      <p className="mt-1 text-xs text-muted">{copy.hint}</p>

      {adminOnly ? (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {copy.lockedAdmin}
        </p>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && code.replace(/\D/g, "").length === 6) submitCode();
          }}
        >
          <input
            id={codeId}
            name="delivery-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ""))}
            placeholder="000000"
            aria-label={copy.inputLabel(reference)}
            className="min-h-11 w-36 rounded-xl border border-border bg-background px-3 py-2 text-center font-mono text-xl tracking-[0.3em] tabular-nums"
          />
          <button
            type="submit"
            disabled={pending || code.replace(/\D/g, "").length !== 6}
            className="min-h-11 rounded-full border border-accent bg-accent px-5 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && !reporting ? copy.checking : copy.submit}
          </button>
        </form>
      )}

      {lockedUntil && !adminOnly && !error && (
        <p className="mt-2 text-xs text-muted">{copy.locked(clock(lockedUntil, dateLocale))}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        {reported ? (
          <p role="status" className="text-xs text-muted">
            {copy.reported}
          </p>
        ) : !reporting ? (
          <button
            type="button"
            onClick={() => {
              setReporting(true);
              setError(null);
            }}
            className="min-h-11 text-left text-sm text-muted underline decoration-border underline-offset-4"
          >
            {copy.cant}
          </button>
        ) : (
          <div>
            <label htmlFor={noteId} className="block text-sm font-medium">
              {copy.cantWhy}
            </label>
            <p className="mt-1 text-xs text-muted">{copy.cantHint}</p>
            <textarea
              id={noteId}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setReporting(false)}
                className="min-h-11 rounded-full border border-border px-4 py-2 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copy.back}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={submitProblem}
                className="min-h-11 rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? copy.sending : copy.send}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
