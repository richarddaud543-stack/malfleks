"use client";

import { useState, useTransition } from "react";
import {
  approvePartnerApplication,
  rejectPartnerApplication,
} from "@/app/actions/partner-review";
import type { ReviewableApplication } from "@/server/partners/review";

/**
 * One application awaiting a decision.
 *
 * Approve is two steps and reject asks for a reason, for the same reason the
 * delete control on `/account` is two steps: these are the irreversible
 * gestures on the page, and a list of them is exactly where a stray Enter lands
 * on the wrong row. The armed state is per card.
 *
 * No `window.confirm()` anywhere — unstyled, unannounced, and it blocks the tab.
 */
export default function ApplicationReviewCard({
  application,
  brandNames,
}: {
  application: ReviewableApplication;
  /** id → display name, so the card can show "Toyota" not "toyota". */
  brandNames: Record<string, string>;
}) {
  const [mode, setMode] = useState<"idle" | "approving" | "rejecting">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCourier = application.kind === "courier";
  const brandLabel = application.brandId
    ? (brandNames[application.brandId] ?? application.brandId)
    : application.brandOther;

  function run(work: () => Promise<{ ok: boolean; reason?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) return; // revalidatePath drops this card from the list
      setMode("idle");
      setError(
        result.reason === "forbidden"
          ? "Your session no longer has admin access. Sign in again."
          : result.reason === "already-reviewed"
            ? "Someone already decided this one. Reload to see the current state."
            : result.reason === "account-already-partnered"
              ? "That account already manages a partner, so it cannot own a second."
              : result.reason === "not-found"
                ? "This application no longer exists."
                : "Couldn't record the decision. Nothing changed — try again."
      );
    });
  }

  return (
    <li className="glass-card rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-muted">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                isCourier
                  ? "bg-accent-2/10 text-accent-2"
                  : "bg-accent/10 text-accent"
              }`}
            >
              {isCourier ? "Courier" : "Brand branch"}
            </span>
            {application.city}
          </p>
          <h3 className="font-display mt-1 text-lg font-medium">
            {application.businessName}
          </h3>
        </div>
        <time
          dateTime={application.createdAt}
          className="text-xs text-muted tabular-nums"
        >
          {new Date(application.createdAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </time>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Contact</dt>
          <dd className="mt-0.5">{application.contactName}</dd>
        </div>
        <div>
          <dt className="text-muted">Phone</dt>
          <dd className="mt-0.5 font-mono text-xs">{application.phone}</dd>
        </div>
        <div>
          <dt className="text-muted">Account</dt>
          <dd className="mt-0.5 break-all text-xs">{application.email}</dd>
        </div>
        {!isCourier && (
          <div>
            <dt className="text-muted">Brand claimed</dt>
            <dd className="mt-0.5">
              {brandLabel}
              {!application.brandId && (
                // The thing an admin most needs to notice: nobody has checked
                // that this business is who it says it is.
                <span className="ml-2 rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-red-600 uppercase">
                  Not in catalogue
                </span>
              )}
            </dd>
          </div>
        )}
        {application.address && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Address</dt>
            <dd className="mt-0.5">{application.address}</dd>
          </div>
        )}
        {application.notes && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Their notes</dt>
            <dd className="mt-0.5 whitespace-pre-line text-muted">
              {application.notes}
            </dd>
          </div>
        )}
      </dl>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {mode === "idle" && (
          <>
            <button
              type="button"
              onClick={() => setMode("approving")}
              aria-label={`Approve ${application.businessName}`}
              className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setMode("rejecting")}
              aria-label={`Reject ${application.businessName}`}
              className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
            >
              Reject
            </button>
            <span className="ml-auto text-xs text-muted">
              Approving creates their partner account. It does not put them on
              the site.
            </span>
          </>
        )}

        {mode === "approving" && (
          <>
            <span className="mr-auto text-sm text-muted">
              Approve {application.businessName} and give this account access?
            </span>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={pending}
              className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => approvePartnerApplication(application.id))
              }
              aria-label={`Yes, approve ${application.businessName}`}
              className="rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Approving…" : "Yes, approve"}
            </button>
          </>
        )}

        {mode === "rejecting" && (
          <div className="w-full">
            <label
              htmlFor={`reject-${application.id}`}
              className="block text-sm font-medium"
            >
              Why are you rejecting this?
            </label>
            <p className="mt-1 text-xs text-muted">
              Stored with the decision. A reason nobody wrote down becomes
              folklore the first time someone asks.
            </p>
            <input
              id={`reject-${application.id}`}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm outline-none hover:border-foreground/30"
            />
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => rejectPartnerApplication(application.id, note))
                }
                aria-label={`Confirm rejection of ${application.businessName}`}
                className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
              >
                {pending ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
