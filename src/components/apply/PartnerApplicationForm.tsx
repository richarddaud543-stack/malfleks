"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { submitPartnerApplication } from "@/app/actions/partner-applications";
import { useSessionState } from "@/components/auth/session-state";
import { usePartnerStatus } from "@/components/apply/partner-status";
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
  "notes",
];

export default function PartnerApplicationForm({
  brands,
}: {
  brands: { id: string; name: string }[];
}) {
  const session = useSessionState();
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

  const brandIds = brands.map((b) => b.id);
  const isBrand = input.kind === "brand";

  function update(patch: Partial<PartnerApplicationInput>) {
    const next = { ...input, ...patch };
    setInput(next);
    if (attempted) {
      const result = validatePartnerApplication(next, brandIds);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFailure(null);

    const result = validatePartnerApplication(input, brandIds);
    if (!result.ok) {
      setErrors(result.errors);
      const firstBroken = FIELD_ORDER.find((field) => result.errors[field]);
      formRef.current
        ?.querySelector<HTMLElement>(`[data-field="${firstBroken}"]`)
        ?.focus();
      return;
    }

    setErrors({});
    setSubmitting(true);
    const outcome = await submitPartnerApplication(input);
    setSubmitting(false);

    if (outcome.submitted) {
      setDone(true);
      return;
    }
    setFailure(
      outcome.reason === "signed-out"
        ? "Your session expired. Sign in again and resend this."
        : outcome.reason === "quota"
          ? "You already have several applications waiting. We'll work through those first."
          : outcome.reason === "rejected"
            ? "Something in the form didn't pass our checks. Look over it and try again."
            : "We couldn't record this right now. Nothing was saved — your answers are still here, so try again in a moment."
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
        <h2 className="font-display text-xl font-medium">Sign in to apply</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          We ask for a sign-in because the account you apply with becomes the
          account you manage your branch from. Nothing else about your MalFleks
          account changes, and applying costs nothing.
        </p>
        <Link
          href="/sign-in?next=/apply"
          className="btn-pill btn-lime mt-8 inline-block px-6 py-2.5 text-sm"
        >
          Sign in to continue
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-medium">
          Application received
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          It is recorded against your account. Someone at MalFleks reviews every
          application by hand — <strong>there is no automatic approval</strong>,
          and we will contact you on the number you gave us.
        </p>
        <Link
          href="/"
          className="btn-pill btn-ink mt-8 inline-block px-6 py-2.5 text-sm"
        >
          Back to MalFleks
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
          You are already a MalFleks partner
        </h2>
        {status.live ? (
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            {status.kind === "courier"
              ? "Your courier account is live. Delivery jobs and your coverage are in your partner area."
              : "Your shop is live on MalFleks. List a product or check what is waiting for review in your partner area."}
          </p>
        ) : (
          // The gap between "approved" and "on the map" is a real state a
          // partner can sit in, and the one most likely to look like a broken
          // site. Name it rather than leaving them to guess.
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Your application was approved and your account is ready. MalFleks
            has not put you on the map yet — that is a second step someone here
            does by hand, and until it is done you cannot list anything. You do
            not need to apply again; we will call you on the number you gave us.
          </p>
        )}
        <Link
          href="/partner"
          className="btn-pill btn-lime mt-8 inline-block px-6 py-2.5 text-sm"
        >
          Go to your partner area
        </Link>
      </div>
    );
  }

  if (status.state === "pending") {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-medium">
          Your application is with us
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          {status.submittedAt ? (
            <>
              Received{" "}
              <strong>
                {new Date(status.submittedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              .{" "}
            </>
          ) : null}
          Someone at MalFleks reads every application by hand, so this takes a
          little time. <strong>You do not need to send another one</strong> — we
          will call you on the number you gave us.
        </p>
        <Link
          href="/"
          className="btn-pill btn-ink mt-8 inline-block px-6 py-2.5 text-sm"
        >
          Back to MalFleks
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
          We reviewed an earlier application from this account and were not able
          to take it on. You are welcome to apply again — if anything has
          changed about your branch or your delivery business, say so in the
          notes at the end.
        </p>
      )}

      {/* The chooser comes first because it decides what the rest of the form
          even asks. Radios rather than a select: two options, both worth
          reading, and arrow keys move between them. */}
      <fieldset className="border-0 p-0">
        <legend className="text-sm font-medium">What are you applying as?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                value: "brand" as PartnerKind,
                title: "A brand branch",
                blurb: "You have a shop or showroom and want to sell through MalFleks.",
              },
              {
                value: "courier" as PartnerKind,
                title: "A delivery courier",
                blurb: "You carry goods and want to be offered delivery jobs.",
              },
            ] as const
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
          label={isBrand ? "Branch or shop name" : "Courier business name"}
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
          label="Who should we speak to?"
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
          label="Phone number"
          hint="A Tanzanian mobile number, e.g. 0754 123 456."
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
          label={isBrand ? "Which city is the branch in?" : "Which city do you cover?"}
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
            <option value="">Choose a city…</option>
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
              label="Which brand do you sell?"
              hint="Not listed? Leave it on 'Another brand' and type the name below."
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
                <option value="">Another brand</option>
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
                label="Name the brand"
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
              label="Street and area the branch trades from"
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
          </>
        )}

        <Field
          id={`${fieldId}-notes`}
          label="Anything else? (optional)"
          hint={
            isBrand
              ? "How many branches you run, what you stock, whether you deliver yourself."
              : "How many riders, what you carry, which areas you know best."
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

      {/* One announced summary rather than relying on the per-field messages,
          which are only reached through aria-describedby as focus moves. */}
      {failure && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          {failure}
        </p>
      )}
      {attempted && Object.keys(errors).length > 0 && (
        <p role="alert" className="mt-6 text-sm text-red-600">
          Check the highlighted answers and send again.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-pill btn-lime mt-7 w-full px-6 py-3 text-sm disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Sending…" : "Send application"}
      </button>

      <p className="mt-4 text-xs text-muted">
        MalFleks reviews every application by hand. Nothing is approved
        automatically, and applying costs nothing.
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
