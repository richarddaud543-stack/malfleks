"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Branch, Brand, Product } from "@/data";
import {
  MAX_QUANTITY,
  ORDER_STORAGE_KEY,
  brandCarrierName,
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
  "address",
];

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

  const [input, setInput] = useState<OrderRequestInput>(emptyOrderInput);
  const [errors, setErrors] = useState<OrderErrors>({});
  // Errors only appear after the first submit, then track every keystroke, so
  // the form never scolds someone who is still filling in the first field.
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(patch: Partial<OrderRequestInput>) {
    const next = { ...input, ...patch };
    setInput(next);
    if (attempted) {
      const result = validateOrderRequest(next, route, product.priceTZS);
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

    const result = validateOrderRequest(input, route, product.priceTZS);
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
    const request = createOrderRequest({
      product,
      brand,
      branch,
      order: result.value,
    });

    store(request);
    setSubmitting(true);

    // Nothing leaves the device for a signed-out customer. Not the order, not
    // the name, phone or address — no request of any kind.
    //
    // This was briefly unconditional: every submission POSTed to `submitOrder`
    // so that every request got a queryable record, signed in or not. The
    // confirmation screen was never updated to match, so the site went on
    // telling people their details had been transmitted nowhere while the
    // server wrote them to Postgres. `e2e/auth.spec.ts` caught it the first
    // time CI ever ran (2026-08-29) by asserting there is no same-origin POST
    // at all — which is why the guard is *here*, in the client, and not a
    // `return` inside the action. An action that declines to write still
    // receives the payload.
    //
    // The owner's call, 2026-08-29: a signed-out request stays in the tab.
    // Nothing is dispatched to a branch anyway, so a stored row bought an
    // admin view of orders nobody acts on, in exchange for holding a
    // stranger's home address with no retention policy.
    if (session?.signedIn) {
      try {
        await submitOrder({
          // Ids and the customer's own words only. Price, product name,
          // carrier and total are re-derived on the server from the catalogue,
          // so nothing here can misstate what was ordered.
          productId: product.id,
          quantity: input.quantity,
          fullName: result.value.fullName,
          phone: result.value.phone,
          address: result.value.address,
          agentId: result.value.agent?.id ?? null,
          reference: request.reference,
          requestedAt: request.requestedAt,
        });
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
    }

    router.push("/order/confirmation");
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
              Choose a delivery agent
            </legend>
            <p className="mt-1 text-sm text-muted">
              {branch.name} doesn&apos;t deliver, so a local agent serving{" "}
              {branch.city} will carry this order.
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
            Your details
          </legend>

          <div className="mt-4 flex flex-col gap-5">
            <Field
              id={`${fieldId}-quantity`}
              label="Quantity"
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
              label="Full name"
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
              label="Phone number"
              hint="A Tanzanian mobile number, e.g. 0754 123 456."
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
              id={`${fieldId}-address`}
              label="Delivery address"
              hint="Street, area and any landmark that helps the driver."
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
            ? `${errorCount} ${errorCount === 1 ? "detail needs" : "details need"} fixing before this request can be sent.`
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
                ? brandCarrierName(brand)
                : selectedAgent?.name ?? null,
            etaEstimate: selectedAgent ? formatEta(selectedAgent.eta) : undefined,
          }}
          branch={{ name: branch.name, city: branch.city }}
          tint={brand.accentColor}
        />

        <button
          type="submit"
          disabled={submitting}
          className="btn-pill btn-lime w-full px-8 py-3.5 text-sm disabled:opacity-60"
        >
          {submitting
            ? "Sending request…"
            : route.kind === "brand"
              ? "Confirm brand delivery"
              : "Confirm agent delivery"}
        </button>

        {/* Load-bearing honesty: this is a request, not a checkout — nothing
            here is transmitted or charged. Keep this literal, not just a
            vibe the styling implies. */}
        <p className="text-xs text-muted">
          This sends a request, not a paid order. No payment is taken at this
          step — the branch confirms availability and price first. If you are
          signed in, you then pay here on MalFleks by mobile money.
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
