"use client";

import { useState, useTransition } from "react";
import {
  approvePartnerApplication,
  rejectPartnerApplication,
} from "@/app/actions/partner-review";
import { viewApplicationDocument } from "@/app/actions/partner-review";
import { REQUIRED_DOCUMENT_KINDS } from "@/lib/partner-document";
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
/** Mirrors the check in `rejectPartnerApplication`, which is the one that counts. */
const MIN_REASON_LENGTH = 3;

/** How the shop answered the delivery question, in the owner's words. */
const DELIVERY_LABELS: Record<string, string> = {
  customer_pays: "Customer pays the fee",
  split: "Split with the customer",
  shop_delivers: "Shop delivers it itself",
};

/** The reader's verdict, and how worried to be about it. */
const VERDICT_STYLE: Record<string, { label: string; className: string }> = {
  pass: { label: "Documents read cleanly", className: "border-border bg-surface-2" },
  concerns: { label: "Something does not line up", className: "border-amber-400 bg-amber-50" },
  unreadable: { label: "Could not be read", className: "border-border bg-surface-2" },
};

const DOCUMENT_LABELS: Record<string, string> = {
  licence: "Business licence",
  tin: "TIN certificate",
  shopfront: "Shop front",
};

/**
 * What the shop uploaded, and what the AI reader made of it.
 *
 * Three deliberate choices here:
 *
 *   * The verdict is a **note beside an approve button**, never a gate on one.
 *     An admin can approve an application the reader flagged and reject one it
 *     passed; this panel exists to tell them where to look.
 *   * A missing verdict says "not screened" rather than nothing, because an
 *     absent verdict and a clean one must never look alike.
 *   * The document link is fetched on click rather than rendered into the page.
 *     A signed URL in server-rendered HTML is a licence sitting in a browser
 *     cache and in every log between here and there; one that lasts five
 *     minutes from the moment it is asked for is not.
 */
function PaperworkPanel({ application }: { application: ReviewableApplication }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const verdict = application.aiVerdict ? VERDICT_STYLE[application.aiVerdict] : null;
  const missing = REQUIRED_DOCUMENT_KINDS.filter(
    (kind) => !application.documents.some((document) => document.kind === kind),
  );

  async function open(documentId: string) {
    setOpening(documentId);
    setLinkError(null);
    const outcome = await viewApplicationDocument(documentId);
    setOpening(null);
    if (!outcome.ok) {
      setLinkError(
        outcome.reason === "unavailable"
          ? "That link could not be created. Check the partner-documents bucket allows admin reads."
          : "That document is no longer there.",
      );
      return;
    }
    window.open(outcome.url, "_blank", "noopener,noreferrer");
  }

  if (application.kind !== "brand") return null;

  return (
    <section className="mt-4 rounded-xl border border-border p-4">
      <h3 className="text-sm font-medium">Paperwork</h3>

      <p
        className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
          verdict ? verdict.className : "border-border bg-surface-2"
        }`}
      >
        <strong className="font-medium">{verdict ? verdict.label : "Not screened"}</strong>
        {application.aiNotes ? <span className="block mt-1 text-muted">{application.aiNotes}</span> : null}
        {!verdict ? (
          <span className="block mt-1 text-muted">
            Read these yourself. The reader either has no key configured or could not reach the files.
          </span>
        ) : null}
      </p>

      {missing.length > 0 && (
        <p className="mt-2 text-sm text-amber-700">
          Missing: {missing.map((kind) => DOCUMENT_LABELS[kind] ?? kind).join(", ")}.
        </p>
      )}

      <ul className="mt-3 grid gap-2">
        {application.documents.map((document) => (
          <li key={document.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{DOCUMENT_LABELS[document.kind] ?? document.kind}</span>
            {document.aiVerdict && document.aiVerdict !== "pass" ? (
              <span className="text-amber-700">{document.aiNotes || document.aiVerdict}</span>
            ) : null}
            <button
              type="button"
              onClick={() => open(document.id)}
              disabled={opening === document.id}
              className="ml-auto rounded-full border border-border px-3 py-1 text-xs font-medium disabled:opacity-60"
            >
              {opening === document.id ? "Opening…" : "Open"}
            </button>
          </li>
        ))}
      </ul>

      {linkError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {linkError}
        </p>
      )}
    </section>
  );
}

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

  // The reason is emailed to the applicant, so "Reject" stays off until there
  // is one. The server action refuses a blank one as well.
  const reasonOk = note.trim().length >= MIN_REASON_LENGTH;

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
                : result.reason === "reason-required"
                  ? "Give a reason — it is emailed to the applicant."
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
        {application.deliveryMode && (
          <div>
            <dt className="text-muted">Delivery</dt>
            <dd className="mt-0.5">{DELIVERY_LABELS[application.deliveryMode] ?? application.deliveryMode}</dd>
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

      <PaperworkPanel application={application} />

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
              className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
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
              className="rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
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
            <p id={`reject-hint-${application.id}`} className="mt-1 text-xs text-muted">
              Required. It is stored with the decision and emailed to the
              applicant as you write it.
            </p>
            <input
              id={`reject-${application.id}`}
              type="text"
              value={note}
              required
              aria-describedby={`reject-hint-${application.id}`}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm outline-none hover:border-foreground/30"
            />
            <div className="mt-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !reasonOk}
                onClick={() =>
                  run(() => rejectPartnerApplication(application.id, note.trim()))
                }
                aria-label={`Confirm rejection of ${application.businessName}`}
                className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:border-border disabled:text-muted disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted"
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
