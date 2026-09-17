"use client";

import { useState } from "react";

import {
  publishProductSubmission,
  rejectProductSubmission,
  type ProductReviewResult,
} from "@/app/actions/product-review";
import ProductIcon from "@/components/product/ProductIcon";
import { formatTZS } from "@/lib/format";
import type { ReviewableSubmission } from "@/server/partners/submissions";

/**
 * One product waiting to be published, and the two things an admin can do
 * about it.
 *
 * Shaped like `ApplicationReviewCard` on purpose — publish is two steps and
 * reject asks for a reason — because these are the same kind of decision: one
 * is irreversible from the customer's side, and the other is a message the
 * partner will read on their own page and act on. A rejection with no reason
 * makes a partner resubmit the identical product forever.
 */

const FAILURE: Record<string, string> = {
  forbidden: "Your session expired, or this account is no longer an admin.",
  "not-found": "This submission no longer exists.",
  "already-reviewed": "Someone already decided this one. Reload the page.",
  "no-branch":
    "This partner isn't on the map yet, so there is no branch to publish to. Put them on the map first, on the main admin page.",
  "slug-taken":
    "A live product already claims that URL. Ask the partner to rename it.",
  unavailable: "We couldn't reach the database. Nothing was changed.",
};

export default function SubmissionReviewCard({
  submission,
  branchLabel,
}: {
  submission: ReviewableSubmission;
  /** "Brand — City", or a note that the partner has no branch yet. */
  branchLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => Promise<ProductReviewResult>) {
    setBusy(true);
    setFailure(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setFailure(FAILURE[result.reason] ?? FAILURE.unavailable);
  }

  return (
    <li className="glass-card rounded-2xl px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          {submission.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={submission.photoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <ProductIcon
              icon={submission.image}
              className="h-10 w-10 shrink-0 text-muted"
            />
          )}
          <div className="min-w-0">
            <p className="font-display text-lg font-medium">{submission.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {submission.category} · {formatTZS(submission.priceTZS)}
              {!submission.inStock && " · marked out of stock"}
            </p>
            <p className="mt-1 text-xs text-muted">{branchLabel}</p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted">
          {new Date(submission.createdAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <p className="mt-4 max-w-prose text-sm text-muted">
        {submission.description}
      </p>

      {submission.specs.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          {submission.specs.map((spec) => (
            <div key={spec.key} className="flex gap-1.5">
              <dt className="font-medium">{spec.key}:</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {failure && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-sm text-muted"
        >
          {failure}
        </p>
      )}

      {!confirming && !rejecting && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Publish ${submission.name}`}
            className="btn-pill btn-lime px-5 py-2 text-sm"
          >
            Publish
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            aria-label={`Send back ${submission.name}`}
            className="btn-pill btn-ink px-5 py-2 text-sm"
          >
            Send back
          </button>
        </div>
      )}

      {confirming && (
        <div className="mt-5">
          <p className="text-sm">
            Publish {submission.name} at {formatTZS(submission.priceTZS)}? It
            goes on the live site immediately.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => publishProductSubmission(submission.id))}
              className="btn-pill btn-lime px-5 py-2 text-sm disabled:opacity-60"
            >
              {busy ? "Publishing…" : "Yes, publish it"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="btn-pill btn-ink px-5 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="mt-5">
          <label
            htmlFor={`note-${submission.id}`}
            className="block text-sm font-medium"
          >
            Why is it going back?
          </label>
          <p className="mt-1 text-xs text-muted">
            The partner reads this on their own page. It is the only place the
            reason exists.
          </p>
          <textarea
            id={`note-${submission.id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-2 w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => rejectProductSubmission(submission.id, note))
              }
              className="btn-pill btn-ink px-5 py-2 text-sm disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send it back"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="btn-pill btn-ink px-5 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
