"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Branch, Brand, Product } from "@/data";
import {
  MAX_QUANTITY,
  ORDER_STORAGE_KEY,
  OTHER_DELIVERY_CITY,
  createOrderRequest,
  emptyOrderInput,
  parseQuantity,
  previewLineTotal,
  serializeOrderRequest,
  validateOrderRequest,
  type DeliveryRoute,
  type OrderErrors,
  type OrderField,
  type OrderRequestInput,
} from "@/lib/order";
import { useLocale } from "@/i18n/client";
import { ORDER } from "@/i18n/copy/order";
import { SHOP } from "@/i18n/copy/shop";
import { formatEta } from "@/lib/format";
import { saveOrderRequest } from "@/app/actions/order-requests";
import { submitOrder } from "@/app/actions/orders";
import { useSessionState } from "@/components/auth/session-state";
import AgentChoice from "./AgentChoice";
import OrderSummary from "./OrderSummary";

/**
 * Reading order of the form, so a failed submit lands the caret on the first
 * thing that is actually wrong rather than the first thing that was declared.
 */
const FIELD_ORDER: OrderField[] = [
  "agentId",
  "quantity",
  "fullName",
  "phone",
  "deliveryCity",
  "address",
];

/**
 * Where a half-filled order waits while the customer signs in.
 *
 * Ordering needs an account (the payment is taken against it), and sign-in is
 * a round trip through Google. Without this the customer came back to an empty
 * form. Per product, in `sessionStorage`: it lives in this tab only, is gone
 * when the tab closes, and is never sent anywhere -- the same rule the
 * signed-out form has always kept.
 */
export function orderDraftKey(productId: string): string {
  return `malfleks:order-draft:${productId}`;
}

function readDraft(productId: string): OrderRequestInput | null {
  try {
    const raw = sessionStorage.getItem(orderDraftKey(productId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Record<string, unknown>;
    const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
    return {
      quantity: text(draft.quantity, emptyOrderInput.quantity),
      fullName: text(draft.fullName, ""),
      phone: text(draft.phone, ""),
      address: text(draft.address, ""),
      agentId: typeof draft.agentId === "string" ? draft.agentId : null,
      deliveryCity: text(draft.deliveryCity, ""),
    };
  } catch {
    return null;
  }
}

export default function OrderRequestForm({
  product,
  brand,
  branch,
  route,
}: {
  product: Product;
  brand: Brand;
  branch: Branch;
  route: DeliveryRoute;
}) {
  const router = useRouter();
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Whether anything may be transmitted at all. `undefined` until the answer
  // arrives, and treated as signed-out until it does — the safe default is the
  // one where nothing leaves the device.
  const session = useSessionState();
  const locale = useLocale();
  const copy = ORDER[locale].form;

  const [input, setInput] = useState<OrderRequestInput>(emptyOrderInput);
  const [errors, setErrors] = useState<OrderErrors>({});
  // Errors only appear after the first submit, then track every keystroke, so
  // the form never scolds someone who is still filling in the first field.
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Back from signing in: put back what was typed before the detour. After
  // mount, not as initial state -- the server render has no sessionStorage and
  // the two must agree.
  useEffect(() => {
    const draft = readDraft(product.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once on mount is the documented exception
    if (draft) setInput(draft);
  }, [product.id]);

  function update(patch: Partial<OrderRequestInput>) {
    const next = { ...input, ...patch };
    setInput(next);
    if (attempted) {
      const result = validateOrderRequest(next, route, product.priceTZS, branch.city, locale);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  /** Writes the browser's copy. Never throws: storage can simply be off. */
  function store(request: ReturnType<typeof createOrderRequest>) {
    try {
      sessionStorage.setItem(ORDER_STORAGE_KEY, serializeOrderRequest(request));
    } catch {
      // Storage can be unavailable (private mode, quota). The confirmation
      // screen already handles having nothing to show, so navigate anyway
      // rather than trapping the customer on a form that looks broken.
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);

    const result = validateOrderRequest(input, route, product.priceTZS, branch.city, locale);
    if (!result.ok) {
      setErrors(result.errors);
      // The inputs are already in the DOM — only their aria state changes — so
      // focus can move now, without waiting a render.
      const firstBroken = FIELD_ORDER.find((field) => result.errors[field]);
      formRef.current
        ?.querySelector<HTMLElement>(`[data-field="${firstBroken}"]`)
        ?.focus();
      return;
    }

    setErrors({});

    // Not signed in: nothing is sent and nothing is ordered. Until 4 Oct 2026
    // this saved a "request" in the browser and showed a confirmation screen
    // for it -- a reference that no shop ever received and that could not be
    // paid for, behind a button that said "Confirm". Now the details are kept
    // in this tab and the customer is taken to sign in, then straight back
    // here with the form filled in.
    //
    // Still true, and still asserted by `e2e/auth.spec.ts`: a signed-out
    // submission makes no request to the server at all.
    if (!session?.signedIn) {
      try {
        sessionStorage.setItem(orderDraftKey(product.id), JSON.stringify(input));
      } catch {
        // Storage can be off (private mode). They will retype; nothing is lost
        // that was ever stored.
      }
      router.push(`/sign-in?next=${encodeURIComponent(`/delivery/${product.id}`)}`);
      return;
    }

    const request = createOrderRequest({
      product,
      brand,
      branch,
      order: result.value,
    });

    store(request);
    setSubmitting(true);

    // Where the customer lands next. An order whose checkout opened goes
    // straight to its pay page (the owner's call, 3 Oct 2026: order, pay,
    // done -- no waiting for anyone to confirm). The confirmation screen is
    // kept for an order that could not be priced yet, or a moment when the
    // server could not be reached.
    let payReference: string | null = null;

    try {
      const submitted = await submitOrder({
        // Ids and the customer's own words only. Price, product name,
        // carrier and total are re-derived on the server from the catalogue,
        // so nothing here can misstate what was ordered.
        productId: product.id,
        quantity: input.quantity,
        fullName: result.value.fullName,
        phone: result.value.phone,
        address: result.value.address,
        agentId: result.value.agent?.id ?? null,
        deliveryCity: input.deliveryCity,
        reference: request.reference,
        requestedAt: request.requestedAt,
      });
      if (submitted.ok && submitted.payNow) payReference = submitted.reference;
    } catch {
      // A failed persist costs the customer nothing they had a moment ago:
      // the browser copy is already written and the confirmation screen does
      // not depend on the backend write having succeeded.
    }

    // The customer's own deletable copy, separate from MalFleks's record above.
    try {
      const outcome = await saveOrderRequest({
        // Ids and the customer's own words only. Price, product name,
        // carrier and total are re-derived on the server from the catalogue,
        // so nothing here can misstate what was ordered.
        productId: product.id,
        quantity: input.quantity,
        fullName: result.value.fullName,
        phone: result.value.phone,
        address: result.value.address,
        agentId: result.value.agent?.id ?? null,
        deliveryCity: input.deliveryCity,
        reference: request.reference,
        requestedAt: request.requestedAt,
      });

      if (outcome.saved) {
        store({ ...request, savedToAccount: true });
      }
    } catch {
      // A failed save costs the customer nothing they had a moment ago: the
      // browser copy is already written and the confirmation screen simply
      // will not claim the request was kept.
    }

    try {
      sessionStorage.removeItem(orderDraftKey(product.id));
    } catch {
      // Nothing to clear if storage is off.
    }

    router.push(payReference ? `/pay/${encodeURIComponent(payReference)}` : "/order/confirmation");
  }

  const selectedAgent =
    route.agents.find((agent) => agent.id === input.agentId) ?? null;

  const errorCount = Object.keys(errors).length;

  const describe = (field: string, hasHint: boolean) => {
    const ids = [
      hasHint ? `${fieldId}-${field}-hint` : null,
      errors[field as keyof OrderErrors] ? `${fieldId}-${field}-error` : null,
    ].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  };

  // A light-theme input needs a border people can actually see at rest, not
  // just on hover/focus — `--border` alone (a ~12% tint) reads as almost
  // nothing on white. `foreground/15` gives a real edge; `/30` on hover and
  // the app-wide `:focus-visible` ring (globals.css) carry the rest.
  // `hasError` swaps the border to a WCAG-safe red so a failed field is
  // visible at a glance, not just to `aria-invalid`.
  const fieldClass = (hasError: boolean) =>
    `w-full rounded-xl border ${
      hasError ? "border-red-600" : "border-foreground/15"
    } bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted hover:border-foreground/30`;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      data-testid="order-request-form"
      className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start"
    >
      <div className="flex flex-col gap-6">
        {route.kind === "agent" && (
          <fieldset
            className="border-0 p-0"
            aria-describedby={describe("agentId", false)}
          >
            <legend className="font-display text-lg font-medium">
              {copy.chooseAgent}
            </legend>
            <p className="mt-1 text-sm text-muted">
              {copy.chooseAgentBody(branch.name, branch.city)}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {route.agents.map((agent, index) => (
                <AgentChoice
                  key={agent.id}
                  agent={agent}
                  name={`${fieldId}-agent`}
                  checked={input.agentId === agent.id}
                  describedBy={describe("agentId", false)}
                  focusKey={index === 0 ? "agentId" : undefined}
                  onSelect={() => update({ agentId: agent.id })}
                />
              ))}
            </div>
            {errors.agentId && (
              <p
                id={`${fieldId}-agentId-error`}
                className="mt-2 text-sm text-red-600"
              >
                {errors.agentId}
              </p>
            )}
          </fieldset>
        )}

        <fieldset className="border-0 p-0">
          <legend className="font-display text-lg font-medium">
            {copy.details}
          </legend>

          <div className="mt-4 flex flex-col gap-5">
            <Field
              id={`${fieldId}-quantity`}
              label={copy.quantity}
              error={errors.quantity}
              errorId={`${fieldId}-quantity-error`}
            >
              <input
                id={`${fieldId}-quantity`}
                name="quantity"
                data-field="quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_QUANTITY}
                value={input.quantity}
                onChange={(e) => update({ quantity: e.target.value })}
                aria-invalid={Boolean(errors.quantity) || undefined}
                aria-describedby={describe("quantity", false)}
                className={`${fieldClass(Boolean(errors.quantity))} sm:max-w-32`}
              />
            </Field>

            <Field
              id={`${fieldId}-fullName`}
              label={copy.fullName}
              error={errors.fullName}
              errorId={`${fieldId}-fullName-error`}
            >
              <input
                id={`${fieldId}-fullName`}
                name="fullName"
                data-field="fullName"
                type="text"
                autoComplete="name"
                value={input.fullName}
                onChange={(e) => update({ fullName: e.target.value })}
                aria-invalid={Boolean(errors.fullName) || undefined}
                aria-describedby={describe("fullName", false)}
                className={fieldClass(Boolean(errors.fullName))}
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
                name="phone"
                data-field="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0754 123 456"
                value={input.phone}
                onChange={(e) => update({ phone: e.target.value })}
                aria-invalid={Boolean(errors.phone) || undefined}
                aria-describedby={describe("phone", true)}
                className={fieldClass(Boolean(errors.phone))}
              />
            </Field>

            <Field
              id={`${fieldId}-deliveryCity`}
              label={copy.city}
              hint={copy.cityHint(branch.city)}
              hintId={`${fieldId}-deliveryCity-hint`}
              error={errors.deliveryCity}
              errorId={`${fieldId}-deliveryCity-error`}
            >
              <select
                id={`${fieldId}-deliveryCity`}
                name="deliveryCity"
                data-field="deliveryCity"
                value={input.deliveryCity ?? ""}
                onChange={(e) => update({ deliveryCity: e.target.value })}
                aria-invalid={Boolean(errors.deliveryCity) || undefined}
                aria-describedby={describe("deliveryCity", true)}
                className={`${fieldClass(Boolean(errors.deliveryCity))} sm:max-w-xs`}
              >
                <option value="">{copy.choose}</option>
                <option value={branch.city}>{branch.city}</option>
                <option value={OTHER_DELIVERY_CITY}>{copy.elsewhere}</option>
              </select>
              {input.deliveryCity === OTHER_DELIVERY_CITY && (
                <p className="mt-2 text-sm text-muted">
                  {copy.outside(branch.city)}{" "}
                  <Link href="/locator" className="text-accent underline underline-offset-4">
                    {copy.findShop}
                  </Link>
                  .
                </p>
              )}
            </Field>

            <Field
              id={`${fieldId}-address`}
              label={copy.address}
              hint={copy.addressHint}
              hintId={`${fieldId}-address-hint`}
              error={errors.address}
              errorId={`${fieldId}-address-error`}
            >
              <textarea
                id={`${fieldId}-address`}
                name="address"
                data-field="address"
                rows={3}
                autoComplete="street-address"
                value={input.address}
                onChange={(e) => update({ address: e.target.value })}
                aria-invalid={Boolean(errors.address) || undefined}
                aria-describedby={describe("address", true)}
                className={`${fieldClass(Boolean(errors.address))} resize-y`}
              />
            </Field>
          </div>
        </fieldset>

        {/* One announcement per failed submit; the per-field messages are
            reached through aria-describedby as focus moves between them. */}
        <p role="alert" className="text-sm text-red-600">
          {attempted && errorCount > 0
            ? copy.fix(errorCount)
            : ""}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        <OrderSummary
          product={{ name: product.name, unitPriceTZS: product.priceTZS }}
          quantity={parseQuantity(input.quantity)}
          lineTotalTZS={previewLineTotal(product.priceTZS, input.quantity)}
          route={{
            kind: route.kind,
            carrier:
              route.kind === "brand"
                ? SHOP[locale].delivery.ownFleet(brand.name)
                : selectedAgent?.name ?? null,
            etaEstimate: selectedAgent ? formatEta(selectedAgent.eta, locale) : undefined,
          }}
          branch={{ name: branch.name, city: branch.city }}
          tint={brand.accentColor}
          locale={locale}
        />

        <button
          type="submit"
          disabled={submitting}
          className="btn-pill btn-lime w-full px-8 py-3.5 text-sm disabled:opacity-60"
        >
          {submitting
            ? copy.opening
            : session?.signedIn
              ? copy.toPayment
              : copy.signIn}
        </button>

        {/* Load-bearing honesty: say exactly what pressing the button does,
            and it is different for the two cases. */}
        <p className="text-xs text-muted">
          {session?.signedIn
            ? copy.noteSignedIn
            : copy.noteSignedOut}
        </p>
      </div>
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
