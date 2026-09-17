"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";

import { listProductForPartner } from "@/app/actions/partner-products";
import ProductIcon from "@/components/product/ProductIcon";
import ProductPhotoUpload from "@/components/partner/ProductPhotoUpload";
import { formatTZS } from "@/lib/format";
import {
  PRODUCT_ICON_KEYS,
  PRODUCT_ICON_LABELS,
} from "@/lib/product-icons";
import {
  MAX_DESCRIPTION,
  emptyProductListing,
  validateProductListing,
  type ProductListingErrors,
  type ProductListingField,
  type ProductListingInput,
} from "@/lib/product-listing";

/**
 * The form a branch partner lists a product with.
 *
 * Validation runs here for the partner's benefit and again inside
 * `submitProduct` for real. The client copy is a courtesy — it saves a round
 * trip and puts the error next to the field — and it is never the control.
 *
 * The icon chooser stays required — a typo-proof, always-available fallback
 * that a free text box could never be. `ProductPhotoUpload` beside it is the
 * optional upgrade: a real photo, uploaded to this project's own
 * `product-photos` Supabase Storage bucket, that the card and detail page
 * show in place of the icon when present.
 */

const FIELD_ORDER: ProductListingField[] = [
  "name",
  "category",
  "price",
  "description",
  "image",
  "photoUrl",
  "specs",
];

const FAILURE_TEXT: Record<string, string> = {
  "signed-out": "Your session expired. Sign in again and resend this.",
  unavailable: "Sign-in isn't available right now, so we can't record this.",
  "not-a-partner":
    "This account isn't linked to a partner any more. Contact MalFleks if that's wrong.",
  "not-a-branch-partner": "Only brand branches can list products.",
  "partner-suspended":
    "This account is suspended, so new listings can't be submitted.",
  "missing-field": "Something in the form came through empty. Check it over.",
  "invalid-price": "The price has to be a whole number of shillings.",
  "invalid-photo":
    "That photo didn't come through properly. Remove it and try uploading again.",
  failed:
    "We couldn't save this right now. Nothing was recorded — your answers are still here, so try again in a moment.",
};

export default function ListProductForm() {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [input, setInput] = useState<ProductListingInput>(emptyProductListing);
  const [errors, setErrors] = useState<ProductListingErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function update(patch: Partial<ProductListingInput>) {
    const next = { ...input, ...patch };
    setInput(next);
    if (attempted) {
      const result = validateProductListing(next);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  function updateSpec(index: number, patch: { key?: string; value?: string }) {
    const specs = input.specs.map((spec, i) =>
      i === index ? { ...spec, ...patch } : spec,
    );
    update({ specs });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFailure(null);

    const result = validateProductListing(input);
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
    const outcome = await listProductForPartner({
      name: result.value.name,
      category: result.value.category,
      description: result.value.description,
      image: result.value.image,
      photoUrl: result.value.photoUrl || undefined,
      priceTZS: result.value.priceTZS,
      inStock: result.value.inStock,
      specs: result.value.specs,
    });
    setSubmitting(false);

    if (outcome.listed) {
      setDone(true);
      return;
    }
    setFailure(FAILURE_TEXT[outcome.reason] ?? FAILURE_TEXT.failed);
  }

  if (done) {
    return (
      <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-medium">Sent for review</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          It is saved against your branch and waiting on MalFleks.{" "}
          <strong>Customers cannot see it yet</strong> — a person reads every
          listing before it goes live, and you&apos;ll see the outcome on your
          listings page either way.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/partner"
            className="btn-pill btn-ink px-6 py-2.5 text-sm"
          >
            Your listings
          </Link>
          <button
            type="button"
            onClick={() => {
              setInput(emptyProductListing);
              setAttempted(false);
              setErrors({});
              setDone(false);
            }}
            className="btn-pill btn-lime px-6 py-2.5 text-sm"
          >
            List another
          </button>
        </div>
      </div>
    );
  }

  const describe = (field: ProductListingField, hasHint: boolean) =>
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

  // Shown under the price as it is typed, so a partner catches a missing or
  // extra zero before MalFleks does.
  const pricePreview = /^\d+$/.test(input.price.replace(/[,\s]/g, ""))
    ? formatTZS(Number(input.price.replace(/[,\s]/g, "")))
    : null;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="glass-card mt-10 rounded-2xl p-6 sm:p-8"
    >
      <div className="grid gap-5">
        <Field
          id={`${fieldId}-name`}
          label="What is it called?"
          error={errors.name}
          errorId={`${fieldId}-name-error`}
        >
          <input
            id={`${fieldId}-name`}
            data-field="name"
            type="text"
            value={input.name}
            onChange={(e) => update({ name: e.target.value })}
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={describe("name", false)}
            className={fieldClass(Boolean(errors.name))}
          />
        </Field>

        <Field
          id={`${fieldId}-category`}
          label="What kind of product is it?"
          hint="A word or two customers would search for — Phones, Cars, Laptops."
          hintId={`${fieldId}-category-hint`}
          error={errors.category}
          errorId={`${fieldId}-category-error`}
        >
          <input
            id={`${fieldId}-category`}
            data-field="category"
            type="text"
            value={input.category}
            onChange={(e) => update({ category: e.target.value })}
            aria-invalid={Boolean(errors.category) || undefined}
            aria-describedby={describe("category", true)}
            className={fieldClass(Boolean(errors.category))}
          />
        </Field>

        <Field
          id={`${fieldId}-price`}
          label="Price in shillings"
          hint="Whole shillings, no decimals. Separators are fine — 1,250,000."
          hintId={`${fieldId}-price-hint`}
          error={errors.price}
          errorId={`${fieldId}-price-error`}
        >
          <input
            id={`${fieldId}-price`}
            data-field="price"
            type="text"
            inputMode="numeric"
            value={input.price}
            onChange={(e) => update({ price: e.target.value })}
            aria-invalid={Boolean(errors.price) || undefined}
            aria-describedby={describe("price", true)}
            className={fieldClass(Boolean(errors.price))}
          />
          {pricePreview && (
            <p className="mt-1.5 text-xs text-muted">Reads as {pricePreview}</p>
          )}
        </Field>

        <Field
          id={`${fieldId}-description`}
          label="Describe it"
          hint={`What a customer reads before ordering. Up to ${MAX_DESCRIPTION} characters.`}
          hintId={`${fieldId}-description-hint`}
          error={errors.description}
          errorId={`${fieldId}-description-error`}
        >
          <textarea
            id={`${fieldId}-description`}
            data-field="description"
            rows={4}
            value={input.description}
            onChange={(e) => update({ description: e.target.value })}
            aria-invalid={Boolean(errors.description) || undefined}
            aria-describedby={describe("description", true)}
            className={fieldClass(Boolean(errors.description))}
          />
        </Field>

        <fieldset className="border-0 p-0" data-field="image">
          <legend className="text-sm font-medium">Pick a picture</legend>
          <p
            id={`${fieldId}-image-hint`}
            className="mt-1 text-xs text-muted"
          >
            Shown until — or unless — you add a real photo below. Choose the
            closest one either way.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {PRODUCT_ICON_KEYS.map((key) => {
              const selected = input.image === key;
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-foreground/15 hover:border-foreground/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="image"
                    value={key}
                    checked={selected}
                    onChange={() => update({ image: key })}
                    className="sr-only"
                  />
                  <ProductIcon
                    icon={key}
                    className={`h-8 w-8 ${selected ? "text-accent" : "text-muted"}`}
                  />
                  <span className="text-[11px] leading-tight text-muted">
                    {PRODUCT_ICON_LABELS[key]}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.image && (
            <p
              id={`${fieldId}-image-error`}
              className="mt-2 text-xs text-red-600"
            >
              {errors.image}
            </p>
          )}
        </fieldset>

        <ProductPhotoUpload
          value={input.photoUrl}
          onChange={(photoUrl) => update({ photoUrl })}
          error={errors.photoUrl}
        />

        <fieldset className="border-0 p-0">
          <legend className="text-sm font-medium">
            Details <span className="font-normal text-muted">(optional)</span>
          </legend>
          <p className="mt-1 text-xs text-muted">
            Year, colour, storage, engine — whatever a buyer asks about.
          </p>
          <div className="mt-3 grid gap-2">
            {input.specs.map((spec, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  aria-label={`Detail ${index + 1} label`}
                  placeholder="Label"
                  value={spec.key}
                  onChange={(e) => updateSpec(index, { key: e.target.value })}
                  className={fieldClass(false)}
                  data-field={index === 0 ? "specs" : undefined}
                />
                <input
                  type="text"
                  aria-label={`Detail ${index + 1} value`}
                  placeholder="Value"
                  value={spec.value}
                  onChange={(e) => updateSpec(index, { value: e.target.value })}
                  className={fieldClass(false)}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              update({ specs: [...input.specs, { key: "", value: "" }] })
            }
            className="mt-3 text-sm text-accent underline decoration-border underline-offset-4"
          >
            Add another detail
          </button>
          {errors.specs && (
            <p className="mt-2 text-xs text-red-600">{errors.specs}</p>
          )}
        </fieldset>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={input.inStock}
            onChange={(e) => update({ inStock: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          It is in stock at your branch now
        </label>
      </div>

      {failure && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-sm text-muted"
        >
          {failure}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn-pill btn-lime mt-8 w-full px-6 py-3 text-sm disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send for review"}
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        Nothing here reaches customers until MalFleks publishes it.
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
  errorId?: string;
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
        <p id={errorId} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
