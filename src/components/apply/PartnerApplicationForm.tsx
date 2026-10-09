"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { submitPartnerApplication } from "@/app/actions/partner-applications";
import { attachApplicationDocuments } from "@/app/actions/partner-documents";
import PartnerDocumentFields, { type PickedFiles } from "@/components/apply/PartnerDocumentFields";
import { uploadPartnerDocuments } from "@/lib/partner-document-upload";
import {
  checkDocumentFile,
  DOCUMENT_KINDS,
  REQUIRED_DOCUMENT_KINDS,
  type DocumentKind,
} from "@/lib/partner-document";
import { DELIVERY_MODES, type DeliveryMode } from "@/lib/fees/tables";
import { useSessionState } from "@/components/auth/session-state";
import { usePartnerStatus } from "@/components/apply/partner-status";
import { useLocale } from "@/i18n/client";
import { APPLY } from "@/i18n/copy/apply";
import {
  MAX_NOTES,
  SERVED_CITIES,
  emptyPartnerApplication,
  validatePartnerApplication,
  type PartnerApplicationErrors,
  type PartnerApplicationField,
  type PartnerApplicationInput,
  type PartnerKind,
} from "@/lib/partner-application";

/**
 * The partner application form.
 *
 * The page around it is a **static Server Component** and stays that way: a
 * top-level `await cookies()` would make `/apply` dynamic, and a brand that
 * cannot find the page cannot apply. So the session is read here, on the
 * client, through the same `/api/auth/session` fetch the navbar uses — and the
 * Server Action checks it again for real, because a client check is a courtesy
 * rather than a control.
 *
 * `brands` arrives as a prop rather than being imported. A `"use client"`
 * module importing `@/data` is debt #7, and it has already reappeared three
 * times in this repo.
 */

const FIELD_ORDER: PartnerApplicationField[] = [
  "businessName",
  "contactName",
  "phone",
  "city",
  "brandId",
  "address",
  "deliveryMode",
  "notes",
];

/** Which copy key describes each delivery answer. */
const DELIVERY_COPY: Record<
  DeliveryMode,
  { title: "deliveryCustomer" | "deliverySplit" | "deliveryShop"; blurb: "deliveryCustomerBlurb" | "deliverySplitBlurb" | "deliveryShopBlurb" }
> = {
  customer_pays: { title: "deliveryCustomer", blurb: "deliveryCustomerBlurb" },
  split: { title: "deliverySplit", blurb: "deliverySplitBlurb" },
  shop_delivers: { title: "deliveryShop", blurb: "deliveryShopBlurb" },
};

export default function PartnerApplicationForm({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const session = useSessionState();
  const locale = useLocale();
  const copy = APPLY[locale].form;
  // Called unconditionally, before any early return: the branches below bail
  // out at several points and a hook after one of them would break the order.
  const status = usePartnerStatus(session?.signedIn);
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [input, setInput] = useState<PartnerApplicationInput>(
    emptyPartnerApplication
  );
  const [errors, setErrors] = useState<PartnerApplicationErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // The documents are picked here and uploaded after the application exists,
  // because a document's storage path contains the application's id.
  const [files, setFiles] = useState<PickedFiles>({});
  const [docProblems, setDocProblems] = useState<Partial<Record<DocumentKind, string>>>({});
  /**
   * Set when the application saved but its documents did not. The applicant is
   * NOT asked to fill the form again -- the id is held here and the retry
   * attaches to the same application.
   */
  const [orphanedId, setOrphanedId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const brandIds = brands.map((b) => b.id);
  const isBrand = input.kind === "brand";

  function update(patch: Partial<PartnerApplicationInput>) {
    const next = { ...input, ...patch };
    setInput(next);
    if (attempted) {
      const result = validatePartnerApplication(next, brandIds, locale);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  const DOC_PROBLEM: Record<"wrong-type" | "too-big" | "empty" | "failed", string> = {
    "wrong-type": copy.documentWrongType,
    "too-big": copy.documentTooBig,
    empty: copy.documentEmpty,
    failed: copy.documentFailed,
  };

  function pickDocument(kind: DocumentKind, file: File | null) {
    setFiles((current) => {
      const next = { ...current };
      if (file) next[kind] = file;
      else delete next[kind];
      return next;
    });
    setDocProblems((current) => {
      const next = { ...current };
      delete next[kind];
      if (file) {
        const check = checkDocumentFile(file);
        if (!check.ok) next[kind] = DOC_PROBLEM[check.reason];
      }
      return next;
    });
  }

  /** Every required document chosen and none of them refused. */
  function documentsReady(): Partial<Record<DocumentKind, string>> | null {
    const problems: Partial<Record<DocumentKind, string>> = { ...docProblems };
    for (const kind of REQUIRED_DOCUMENT_KINDS) {
      if (!files[kind]) problems[kind] = copy.documentMissing;
    }
    return DOCUMENT_KINDS.some((kind) => problems[kind]) ? problems : null;
  }

  /**
   * Upload the picked documents and attach them to `applicationId`.
   *
   * Returns true when the applicant can be shown the plain "received" screen.
   * False means the application is saved but its paperwork is not, which is the
   * one case where the done screen says something extra and offers a retry.
   */
  async function sendDocuments(applicationId: string): Promise<boolean> {
    const picked = REQUIRED_DOCUMENT_KINDS.flatMap((kind) => {
      const file = files[kind];
      return file ? [{ kind, file }] : [];
    });
    if (picked.length === 0) return false;

    const uploaded = await uploadPartnerDocuments(applicationId, picked);
    if (uploaded.unavailable) {
      setDocProblems({ licence: copy.documentUnavailable });
      return false;
    }
    if (uploaded.failed.length > 0) {
      setDocProblems((current) => {
        const next = { ...current };
        for (const failure of uploaded.failed) next[failure.kind] = DOC_PROBLEM[failure.reason];
        return next;
      });
    }
    if (uploaded.sent.length === 0) return false;

    const attached = await attachApplicationDocuments(applicationId, uploaded.sent);
    // A refusal here is not shown as a per-document problem: it is about the
    // application, not the file. The done screen's note covers it.
    return attached.attached && uploaded.failed.length === 0;
  }

  async function retryDocuments() {
    if (!orphanedId) return;
    setAttaching(true);
    const ok = await sendDocuments(orphanedId);
    setAttaching(false);
    if (ok) setOrphanedId(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFailure(null);

    const result = validatePartnerApplication(input, brandIds, locale);
    if (!result.ok) {
      setErrors(result.errors);
      const firstBroken = FIELD_ORDER.find((field) => result.errors[field]);
      formRef.current
        ?.querySelector<HTMLElement>(`[data-field="${firstBroken}"]`)
        ?.focus();
      return;
    }

    // Checked before anything is sent: an application saved without its
    // paperwork is a worse place to be than a form that would not submit.
    // Couriers are not asked for documents at all.
    if (isBrand) {
      const docProblem = documentsReady();
      if (docProblem) {
        setErrors({});
        setDocProblems(docProblem);
        const firstBroken = DOCUMENT_KINDS.find((kind) => docProblem[kind]);
        formRef.current
          ?.querySelector<HTMLElement>(`[data-field="document-${firstBroken}"]`)
          ?.focus();
        return;
      }
    }

    setErrors({});
    setSubmitting(true);
    const outcome = await submitPartnerApplication(input);

    if (outcome.submitted) {
      // The application is saved from here on. Nothing below may show the
      // applicant a failure that suggests otherwise.
      const sent = isBrand ? await sendDocuments(outcome.id) : true;
      setSubmitting(false);
      if (!sent) setOrphanedId(outcome.id);
      setDone(true);
      return;
    }
    setSubmitting(false);
    setFailure(
      outcome.reason === "signed-out"
        ? copy.failSignedOut
        : outcome.reason === "quota"
          ? copy.failQuota
          : outcome.reason === "rejected"
            ? copy.failRejected
            : outcome.reason === "rate-limited"
              ? copy.failRate
              : copy.failOther
    );
  }

  // `undefined` while the session request is in flight. Reserve the space
  // rather than collapsing the page, so nothing jumps when the answer lands.
  if (session === undefined) {
    return (
      <div
        className="glass-card mt-10 min-h-64 animate-pulse rounded-2xl"
        aria-hidden="true"
      />
    );
  }

  if (!session.signedIn) {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-10 text-center">
        <h2 className="font-display text-xl font-medium">{copy.signInHeading}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          {copy.signInBody}
        </p>
        <Link
          href="/sign-in?next=/apply"
          className="btn-pill btn-lime mt-8 inline-block px-6 py-2.5 text-sm"
        >
          {copy.signInAction}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-medium">
          {copy.doneHeading}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          {copy.doneBody.before}
          <strong>{copy.doneBody.strong}</strong>
          {copy.doneBody.after}
        </p>
        {orphanedId && (
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-sm text-muted">{copy.documentsLate}</p>
            <button
              type="button"
              onClick={retryDocuments}
              disabled={attaching}
              className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {attaching ? copy.documentsSending : copy.documentsLateRetry}
            </button>
          </div>
        )}
        <Link
          href="/"
          className="btn-pill btn-ink mt-8 inline-block px-6 py-2.5 text-sm"
        >
          {copy.back}
        </Link>
      </div>
    );
  }

  // Everything below this point is for a signed-in account that has not just
  // submitted. What it has already done with MalFleks decides what it sees.
  //
  // Before this existed, all of these people got the same blank form: a shop
  // whose application was sitting in the review queue, and a partner who had
  // been approved and put on the map weeks earlier. Nothing acknowledged
  // either. Since the quota allows five *pending* applications per account,
  // and nothing emails an applicant when they are approved, the natural
  // response to that silence — apply again — worked, five times, filling the
  // owner's queue with duplicate rows for one business.

  if (status === undefined) {
    return (
      <div
        className="glass-card mt-10 min-h-64 animate-pulse rounded-2xl"
        aria-hidden="true"
      />
    );
  }

  if (status.state === "partner") {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-medium">
          {copy.partnerHeading}
        </h2>
        {status.live ? (
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            {status.kind === "courier"
              ? copy.liveCourier
              : copy.liveShop}
          </p>
        ) : (
          // The gap between "approved" and "on the map" is a real state a
          // partner can sit in, and the one most likely to look like a broken
          // site. Name it rather than leaving them to guess.
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            {copy.notLive}
          </p>
        )}
        <Link
          href="/partner"
          className="btn-pill btn-lime mt-8 inline-block px-6 py-2.5 text-sm"
        >
          {copy.partnerArea}
        </Link>
      </div>
    );
  }

  if (status.state === "pending") {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-medium">
          {copy.pendingHeading}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          {status.submittedAt ? (
            <>
              {copy.received}{" "}
              <strong>
                {new Date(status.submittedAt).toLocaleDateString(APPLY[locale].dateLocale, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              .{" "}
            </>
          ) : null}
          {copy.pendingBody.before}
          <strong>{copy.pendingBody.strong}</strong>
          {copy.pendingBody.after}
        </p>
        <Link
          href="/"
          className="btn-pill btn-ink mt-8 inline-block px-6 py-2.5 text-sm"
        >
          {copy.back}
        </Link>
      </div>
    );
  }

  const describe = (field: PartnerApplicationField, hasHint: boolean) =>
    [
      hasHint ? `${fieldId}-${field}-hint` : null,
      errors[field] ? `${fieldId}-${field}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const fieldClass = (hasError: boolean) =>
    `w-full rounded-xl border ${
      hasError ? "border-red-600" : "border-foreground/15"
    } bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted hover:border-foreground/30`;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="glass-card mt-10 rounded-2xl p-6 sm:p-8"
    >
      {/* A previous application that was turned down still leaves the form
          open, because the quota counts only pending rows and a business whose
          circumstances have changed is entitled to another go. Saying so is
          kinder than a blank form that pretends the first one never happened,
          and honest about the fact that we remember it. */}
      {status.state === "rejected" && (
        <p className="mb-6 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          {copy.rejectedNote}
        </p>
      )}

      {/* The chooser comes first because it decides what the rest of the form
          even asks. Radios rather than a select: two options, both worth
          reading, and arrow keys move between them. */}
      <fieldset className="border-0 p-0">
        <legend className="text-sm font-medium">{copy.kindLegend}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                value: "brand" as PartnerKind,
                title: copy.kindBrand,
                blurb: copy.kindBrandBlurb,
              },
              {
                value: "courier" as PartnerKind,
                title: copy.kindCourier,
                blurb: copy.kindCourierBlurb,
              },
            ]
          ).map((option) => {
            const selected = input.kind === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
                  selected
                    ? "border-accent bg-accent/5"
                    : "border-foreground/15 hover:border-foreground/30"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={selected}
                  onChange={() => update({ kind: option.value })}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {option.blurb}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-7 grid gap-5">
        <Field
          id={`${fieldId}-businessName`}
          label={isBrand ? copy.businessBrand : copy.businessCourier}
          error={errors.businessName}
          errorId={`${fieldId}-businessName-error`}
        >
          <input
            id={`${fieldId}-businessName`}
            data-field="businessName"
            type="text"
            autoComplete="organization"
            value={input.businessName}
            onChange={(e) => update({ businessName: e.target.value })}
            aria-invalid={Boolean(errors.businessName) || undefined}
            aria-describedby={describe("businessName", false)}
            className={fieldClass(Boolean(errors.businessName))}
          />
        </Field>

        <Field
          id={`${fieldId}-contactName`}
          label={copy.contact}
          error={errors.contactName}
          errorId={`${fieldId}-contactName-error`}
        >
          <input
            id={`${fieldId}-contactName`}
            data-field="contactName"
            type="text"
            autoComplete="name"
            value={input.contactName}
            onChange={(e) => update({ contactName: e.target.value })}
            aria-invalid={Boolean(errors.contactName) || undefined}
            aria-describedby={describe("contactName", false)}
            className={fieldClass(Boolean(errors.contactName))}
          />
        </Field>

        <Field
          id={`${fieldId}-phone`}
          label={copy.phone}
          hint={copy.phoneHint}
          hintId={`${fieldId}-phone-hint`}
          error={errors.phone}
          errorId={`${fieldId}-phone-error`}
        >
          <input
            id={`${fieldId}-phone`}
            data-field="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={input.phone}
            onChange={(e) => update({ phone: e.target.value })}
            aria-invalid={Boolean(errors.phone) || undefined}
            aria-describedby={describe("phone", true)}
            className={fieldClass(Boolean(errors.phone))}
          />
        </Field>

        <Field
          id={`${fieldId}-city`}
          label={isBrand ? copy.cityBrand : copy.cityCourier}
          error={errors.city}
          errorId={`${fieldId}-city-error`}
        >
          <select
            id={`${fieldId}-city`}
            data-field="city"
            value={input.city}
            onChange={(e) => update({ city: e.target.value })}
            aria-invalid={Boolean(errors.city) || undefined}
            aria-describedby={describe("city", false)}
            className={fieldClass(Boolean(errors.city))}
          >
            <option value="">{copy.chooseCity}</option>
            {SERVED_CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </Field>

        {isBrand && (
          <>
            <Field
              id={`${fieldId}-brandId`}
              label={copy.brand}
              hint={copy.brandHint}
              hintId={`${fieldId}-brandId-hint`}
              error={errors.brandId}
              errorId={`${fieldId}-brandId-error`}
            >
              <select
                id={`${fieldId}-brandId`}
                data-field="brandId"
                value={input.brandId}
                onChange={(e) => update({ brandId: e.target.value })}
                aria-invalid={Boolean(errors.brandId) || undefined}
                aria-describedby={describe("brandId", true)}
                className={fieldClass(Boolean(errors.brandId))}
              >
                <option value="">{copy.anotherBrand}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </Field>

            {input.brandId === "" && (
              <Field
                id={`${fieldId}-brandOther`}
                label={copy.brandOther}
                error={errors.brandOther}
                errorId={`${fieldId}-brandOther-error`}
              >
                <input
                  id={`${fieldId}-brandOther`}
                  data-field="brandOther"
                  type="text"
                  value={input.brandOther}
                  onChange={(e) => update({ brandOther: e.target.value })}
                  aria-invalid={Boolean(errors.brandOther) || undefined}
                  aria-describedby={describe("brandOther", false)}
                  className={fieldClass(Boolean(errors.brandOther))}
                />
              </Field>
            )}

            <Field
              id={`${fieldId}-address`}
              label={copy.address}
              error={errors.address}
              errorId={`${fieldId}-address-error`}
            >
              <input
                id={`${fieldId}-address`}
                data-field="address"
                type="text"
                autoComplete="street-address"
                value={input.address}
                onChange={(e) => update({ address: e.target.value })}
                aria-invalid={Boolean(errors.address) || undefined}
                aria-describedby={describe("address", false)}
                className={fieldClass(Boolean(errors.address))}
              />
            </Field>

            {/* Who pays for delivery. One answer, asked once, and it sets what
                every customer of this shop is charged -- so the options are
                written as what the customer will see, not as policy names. */}
            {/* The error is tied to the group, not to each radio: `aria-invalid`
                is not a supported property of role="radio", and a screen reader
                announcing "invalid" three times tells the listener nothing about
                which answer to give. */}
            <fieldset
              className="border-0 p-0"
              aria-describedby={
                errors.deliveryMode
                  ? `${fieldId}-deliveryMode-hint ${fieldId}-deliveryMode-error`
                  : `${fieldId}-deliveryMode-hint`
              }
            >
              <legend className="text-sm font-medium">{copy.deliveryLegend}</legend>
              <p id={`${fieldId}-deliveryMode-hint`} className="mt-1 text-sm text-muted">
                {copy.deliveryHint}
              </p>
              <div className="mt-3 grid gap-2">
                {DELIVERY_MODES.map((mode) => {
                  const words = DELIVERY_COPY[mode];
                  return (
                    <label
                      key={mode}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                        input.deliveryMode === mode
                          ? "border-accent bg-surface-2"
                          : "border-border"
                      }`}
                    >
                      <input
                        type="radio"
                        name="deliveryMode"
                        data-field={input.deliveryMode === "" && mode === DELIVERY_MODES[0] ? "deliveryMode" : undefined}
                        value={mode}
                        checked={input.deliveryMode === mode}
                        onChange={() => update({ deliveryMode: mode })}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium">{copy[words.title]}</span>
                        <span className="mt-0.5 block text-sm text-muted">{copy[words.blurb]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.deliveryMode && (
                <p id={`${fieldId}-deliveryMode-error`} className="mt-1.5 text-sm text-danger">
                  {errors.deliveryMode}
                </p>
              )}
            </fieldset>
          </>
        )}

        <Field
          id={`${fieldId}-notes`}
          label={copy.notes}
          hint={
            isBrand
              ? copy.notesHintBrand
              : copy.notesHintCourier
          }
          hintId={`${fieldId}-notes-hint`}
          error={errors.notes}
          errorId={`${fieldId}-notes-error`}
        >
          <textarea
            id={`${fieldId}-notes`}
            data-field="notes"
            rows={4}
            maxLength={MAX_NOTES}
            value={input.notes}
            onChange={(e) => update({ notes: e.target.value })}
            aria-invalid={Boolean(errors.notes) || undefined}
            aria-describedby={describe("notes", true)}
            className={fieldClass(Boolean(errors.notes))}
          />
        </Field>
      </div>

      {isBrand && (
        <div className="mt-6">
          <PartnerDocumentFields
            files={files}
            problems={docProblems}
            onChange={pickDocument}
            disabled={submitting}
          />
        </div>
      )}

      {/* One announced summary rather than relying on the per-field messages,
          which are only reached through aria-describedby as focus moves. */}
      {failure && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {failure}
        </p>
      )}
      {attempted && Object.keys(errors).length > 0 && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {copy.check}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-pill btn-lime mt-7 w-full px-6 py-3 text-sm disabled:opacity-60 sm:w-auto"
      >
        {submitting ? copy.sending : copy.send}
      </button>

      <p className="mt-4 text-xs text-muted">
        {copy.footnote}
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={errorId} className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
