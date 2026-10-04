"use client";

import { useId, useRef, useState } from "react";

import {
  SELLER_CATEGORIES,
  specSuggestionsFor,
} from "@/lib/product-categories";
import Link from "next/link";

import { listProductForPartner } from "@/app/actions/partner-products";
import DescriptionHelper from "@/components/partner/DescriptionHelper";
import ProductIcon from "@/components/product/ProductIcon";
import ProductPhotoUpload from "@/components/partner/ProductPhotoUpload";
import { MINIMUM_ORDER_VALUE_TZS } from "@/lib/fees";
import { formatTZS } from "@/lib/format";
import {
  PRODUCT_ICON_KEYS,
  PRODUCT_ICON_LABELS,
} from "@/lib/product-icons";
import { matchProductIcons } from "@/lib/product-icon-match";
import {
  MAX_DESCRIPTION,
  MAX_SPECS,
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
  "photoUrls",
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
    "One of the photos didn't come through properly. Remove it and try uploading again.",
  "invalid-name": "Give the product a name customers would recognise.",
  "invalid-description": `The description should be a sentence or two, and no more than ${MAX_DESCRIPTION} characters.`,
  "invalid-image": "Choose one of the pictures from the list.",
  "invalid-specs": `Every detail needs both a label and a value, and there can be at most ${MAX_SPECS}.`,
  "rate-limited":
    "You've submitted a few of these in quick succession. Wait a bit and try again.",
  failed:
    "We couldn't save this right now. Nothing was recorded — your answers are still here, so try again in a moment.",
};

export default function ListProductForm({
  ai = { describe: false, cleanPhoto: false },
}: {
  /**
   * Which optional AI helpers this deployment has keys for. The page works
   * that out on the server; with neither, the form is exactly the form it
   * always was.
   */
  ai?: { describe: boolean; cleanPhoto: boolean };
} = {}) {
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [input, setInput] = useState<ProductListingInput>(emptyProductListing);
  const [errors, setErrors] = useState<ProductListingErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Photos still being shrunk or uploaded. Sending now would file the listing
  // without them, so the button waits.
  const [photosBusy, setPhotosBusy] = useState(false);
  // Bumped by "List another" so the photo control starts again from empty —
  // it keeps its own per-photo state, which resetting `input` cannot reach.
  const [formRound, setFormRound] = useState(0);

  function update(patch: Partial<ProductListingInput>) {
    const next = { ...input, ...patch };
    setInput(next);
    if (attempted) {
      const result = validateProductListing(next);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  /** Adds a suggested detail label, ready for its value to be typed. */
  function addSuggestedSpec(label: string) {
    // Reuse the first completely blank row rather than leaving it stranded
    // above the new ones — the form starts with one.
    const blank = input.specs.findIndex(
      (spec) => spec.key.trim() === "" && spec.value.trim() === "",
    );
    const specs =
      blank === -1
        ? [...input.specs, { key: label, value: "" }]
        : input.specs.map((spec, i) => (i === blank ? { key: label, value: "" } : spec));
    update({ specs });
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
      photoUrls: result.value.photoUrls,
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
              setPhotosBusy(false);
              setFormRound((round) => round + 1);
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

  // How many a customer must buy at once for the order to reach the minimum,
  // or `null` when one is enough (or there is no price yet).
  const typedPrice = /^\d+$/.test(input.price.replace(/[,\s]/g, ""))
    ? Number(input.price.replace(/[,\s]/g, ""))
    : null;
  const belowMinimum =
    typedPrice && MINIMUM_ORDER_VALUE_TZS !== null && typedPrice < MINIMUM_ORDER_VALUE_TZS
      ? Math.ceil(MINIMUM_ORDER_VALUE_TZS / typedPrice)
      : null;

  // Ranked as they type the name and category — see `matchProductIcons` for
  // the scoring. Empty until either field has something worth matching
  // against, so a blank form shows the full grid rather than an empty
  // "Suggested" row with nothing in it.
  const suggestedIcons = matchProductIcons(`${input.name} ${input.category}`);

  // Detail labels buyers ask about for this kind of product, offered only
  // while the partner has not started writing details of their own. Once any
  // value has been typed the chips step aside: they are a head start, and a
  // row of suggestions beside details already written reads as "you missed
  // these". Tapping a chip adds a label with no value, so several can be
  // added in a row before the first value is typed.
  const usedSpecLabels = new Set(
    input.specs.map((spec) => spec.key.trim().toLowerCase()).filter(Boolean),
  );
  const offeredSpecs = specSuggestionsFor(input.category);
  const specValuesEmpty = input.specs.every((spec) => spec.value.trim() === "");
  const specChips = specValuesEmpty
    ? offeredSpecs.filter((label) => !usedSpecLabels.has(label.toLowerCase()))
    : [];

  const descriptionLength = input.description.trim().length;
  const descriptionOver = descriptionLength > MAX_DESCRIPTION;

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
          hint="Pick the closest one. Customers filter the shop by these."
          hintId={`${fieldId}-category-hint`}
          error={errors.category}
          errorId={`${fieldId}-category-error`}
        >
          {/* A pick list since 4 Oct 2026. It was a text box with suggestions,
              and the first live listing came through with the kind "wet". */}
          <select
            id={`${fieldId}-category`}
            data-field="category"
            value={input.category}
            onChange={(e) => update({ category: e.target.value })}
            aria-invalid={Boolean(errors.category) || undefined}
            aria-describedby={describe("category", true)}
            className={fieldClass(Boolean(errors.category))}
          >
            <option value="">Choose…</option>
            {SELLER_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
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
          {/* Not an error: a shop may well sell a TSh 2,000 cable. But the
              partner should know one of them alone cannot be ordered. */}
          {belowMinimum && (
            <p className="mt-1.5 text-xs text-muted" data-testid="below-minimum-note">
              Orders on MalFleks start at {formatTZS(MINIMUM_ORDER_VALUE_TZS as number)}, so a
              customer would have to buy at least {belowMinimum} of these in one order.
            </p>
          )}
        </Field>

        <Field
          id={`${fieldId}-description`}
          label="Describe it"
          hint="What a customer reads before ordering. Say what it is, whether it is new or used, what comes in the box, any warranty, and anything else a buyer should know."
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
            aria-describedby={
              [describe("description", true), `${fieldId}-description-count`]
                .filter(Boolean)
                .join(" ")
            }
            className={fieldClass(Boolean(errors.description))}
          />
          {/* Counted the way the validator counts it — trimmed — so the
              number never disagrees with the error under it. Not a live
              region: announcing every keystroke would bury the field for a
              screen-reader user. It is tied to the textarea with
              `aria-describedby` instead, so it is read on focus. */}
          <p
            id={`${fieldId}-description-count`}
            data-testid="description-count"
            className={`mt-1.5 text-right text-xs tabular-nums ${
              descriptionOver ? "font-medium text-red-600" : "text-muted"
            }`}
          >
            {descriptionLength} / {MAX_DESCRIPTION}
          </p>
          {ai.describe && (
            <DescriptionHelper
              facts={() => ({
                name: input.name,
                category: input.category,
                notes: input.description,
                specs: input.specs,
                photoUrl: input.photoUrls[0] ?? null,
              })}
              onUse={(description) => update({ description })}
            />
          )}
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
          {suggestedIcons.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Suggested for &ldquo;{input.name || input.category}&rdquo;
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {suggestedIcons.map((key) => {
                  const selected = input.image === key;
                  return (
                    <label
                      key={`suggested-${key}`}
                      className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                        selected
                          ? "border-accent bg-accent/5"
                          : "border-accent/40 bg-accent/[0.03] hover:border-accent/70"
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
                        className={`h-8 w-8 ${selected ? "text-accent" : "text-foreground/70"}`}
                      />
                      <span className="text-[11px] leading-tight text-muted">
                        {PRODUCT_ICON_LABELS[key]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted">
            {suggestedIcons.length > 0 ? "All pictures" : "Choose one"}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
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
          key={formRound}
          value={input.photoUrls}
          onChange={(photoUrls) => update({ photoUrls })}
          onBusyChange={setPhotosBusy}
          error={errors.photoUrls}
          cleanBackground={ai.cleanPhoto}
        />

        <fieldset className="border-0 p-0">
          <legend className="text-sm font-medium">
            Details <span className="font-normal text-muted">(optional)</span>
          </legend>
          <p className="mt-1 text-xs text-muted">
            Year, colour, storage, engine — whatever a buyer asks about.
          </p>
          {specChips.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Buyers usually ask about
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {specChips.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => addSuggestedSpec(label)}
                    aria-label={`Add a detail for ${label}`}
                    className="min-h-11 rounded-full border border-accent/40 bg-accent/[0.03] px-4 text-sm text-foreground transition-colors hover:border-accent/70"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            </div>
          )}
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
        disabled={submitting || photosBusy}
        className="btn-pill btn-lime mt-8 w-full px-6 py-3 text-sm disabled:opacity-60"
      >
        {submitting
          ? "Sending…"
          : photosBusy
            ? "Waiting for photos to upload…"
            : "Send for review"}
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
