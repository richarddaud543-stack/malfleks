"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { reportListing } from "@/app/actions/listing-reports";
import { useSessionState } from "@/components/auth/session-state";
import { useLocale } from "@/i18n/client";
import { REPORT } from "@/i18n/copy/report";
import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";
import { REPORT_DETAILS_MAX, REPORT_REASONS, validateListingReport } from "@/lib/listing-report";

/**
 * The "Report this listing" form. See `reportListing` for what happens to a
 * report and why it needs an account.
 *
 * Signed out, the form is still shown -- so a rights holder can see what will
 * be asked -- but the button takes them to sign in and back here, and the
 * email route is named beside it.
 */
export default function ReportListingForm({ productId, productPath }: { productId: string; productPath: string }) {
  const copy = REPORT[useLocale()];
  const id = useId();
  const router = useRouter();
  const session = useSessionState();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = validateListingReport({ productId, reason, details });
  const errors = attempted && !check.ok ? check.errors : {};
  const detailsError =
    errors.details === "missing"
      ? copy.errors.detailsMissing
      : errors.details === "too-short"
        ? copy.errors.detailsShort
        : errors.details === "too-long"
          ? copy.errors.detailsLong(REPORT_DETAILS_MAX)
          : null;

  if (sent) {
    return (
      <div role="status" className="glass-card mt-8 rounded-2xl p-6 text-sm">
        <p>{copy.sent}</p>
        <Link href={productPath} className="mt-4 inline-block text-accent underline underline-offset-4">
          {copy.back}
        </Link>
      </div>
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFailure(null);
    if (!session?.signedIn) {
      // The same round trip as the order form: sign in, then straight back here.
      router.push(`/sign-in?next=${encodeURIComponent(`/report/${productId}`)}`);
      return;
    }
    if (!check.ok) return;
    startTransition(async () => {
      const result = await reportListing({ productId, reason, details });
      if (result.ok) setSent(true);
      else setFailure(copy.failed[result.reason]);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6" data-testid="report-listing-form">
      <fieldset className="border-0 p-0" aria-describedby={errors.reason ? `${id}-reason-error` : undefined}>
        <legend className="font-display text-lg font-medium">{copy.reasonLegend}</legend>
        <div className="mt-3 flex flex-col gap-2">
          {REPORT_REASONS.map((value) => (
            <label key={value} className="flex items-start gap-3 rounded-xl border border-foreground/15 px-4 py-3 text-sm">
              <input
                type="radio"
                name={`${id}-reason`}
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              {copy.reasons[value]}
            </label>
          ))}
        </div>
        {errors.reason && (
          <p id={`${id}-reason-error`} className="mt-2 text-sm text-red-600">
            {copy.errors.reason}
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${id}-details`} className="block text-sm font-medium">
          {copy.details}
        </label>
        <p id={`${id}-details-hint`} className="mt-1 text-xs text-muted">
          {copy.detailsHint}
        </p>
        <textarea
          id={`${id}-details`}
          rows={5}
          maxLength={REPORT_DETAILS_MAX + 200}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          aria-invalid={Boolean(detailsError) || undefined}
          aria-describedby={[`${id}-details-hint`, detailsError ? `${id}-details-error` : null].filter(Boolean).join(" ")}
          className={`mt-2 w-full resize-y rounded-xl border ${
            detailsError ? "border-red-600" : "border-foreground/15"
          } bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none hover:border-foreground/30`}
        />
        {detailsError && (
          <p id={`${id}-details-error`} className="mt-2 text-sm text-red-600">
            {detailsError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={pending} className="btn-pill btn-lime self-start px-7 py-3 text-sm disabled:opacity-60">
          {pending ? copy.sending : session?.signedIn ? copy.send : copy.signIn}
        </button>
        {!session?.signedIn && <p className="text-xs text-muted">{copy.signedOutNote(MALFLEKS_CONTACT_EMAIL)}</p>}
        {failure && (
          <p role="alert" className="text-sm text-red-600">
            {failure}
          </p>
        )}
      </div>
    </form>
  );
}
