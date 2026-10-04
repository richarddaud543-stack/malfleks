"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ORDER_STORAGE_KEY,
  formatPhone,
  parseOrderRequest,
  type OrderRequest,
} from "@/lib/order";
import { useLocale } from "@/i18n/client";
import { carrierLabel, ORDER } from "@/i18n/copy/order";
import OrderSummary from "./OrderSummary";

/** The stored request never changes while this screen is open. */
function subscribe() {
  return () => {};
}

function readStoredOrder(): string | null {
  try {
    return sessionStorage.getItem(ORDER_STORAGE_KEY);
  } catch {
    // Storage blocked entirely — same outcome as an empty one.
    return null;
  }
}

export default function OrderConfirmation() {
  const locale = useLocale();
  const copy = ORDER[locale].confirmation;
  // The request lives only in this browser tab, so the server has nothing to
  // render. `undefined` is the server snapshot: it holds the loading state
  // through hydration instead of flashing "no request" at everyone.
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribe,
    readStoredOrder,
    () => undefined
  );

  const order = useMemo<OrderRequest | null | undefined>(
    () => (raw === undefined ? undefined : parseOrderRequest(raw)),
    [raw]
  );

  if (order === undefined) {
    return (
      <p className="text-muted" role="status">
        {copy.loading}
      </p>
    );
  }

  if (order === null) {
    return (
      <div className="glass-card rounded-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-medium">
          {copy.noneHeading}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {copy.noneBody}
        </p>
        <p className="mt-3 text-sm text-muted">
          {copy.noneAccount.before}
          <Link
            href="/account"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {copy.noneAccount.link}
          </Link>
          {copy.noneAccount.after}
        </p>
        <Link
          href="/search"
          className="btn-pill btn-lime mt-8 px-6 py-2.5 text-sm"
        >
          {copy.browse}
        </Link>
      </div>
    );
  }

  const brandDelivered = order.route.kind === "brand";
  // `slug` was added to the stored record after the first requests were
  // written, so fall back to `id` for anything still in a customer's
  // localStorage from an earlier build — the two match for every seed brand.
  const branchHref = `/brands/${order.brand.slug ?? order.brand.id}/branches/${order.branch.id}`;

  return (
    <div data-testid="order-confirmation">
      <p className="font-accent-serif text-xl italic text-accent">
        {copy.eyebrow}
      </p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        {copy.heading(order.product.name)}
      </h1>

      <div className="glass-card mt-8 rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wide text-muted">
          {copy.reference}
        </p>
        <p
          data-testid="order-reference"
          className="mt-2 font-mono text-3xl font-medium tracking-[0.2em]"
        >
          {order.reference}
        </p>
        <p className="mt-3 text-sm text-muted">
          {copy.quote(brandDelivered)}
        </p>

        {/* The single most useful thing this screen can tell someone: whether
            the reference will still exist tomorrow. Both branches are stated
            plainly rather than only celebrating the good one. */}
        {order.savedToAccount ? (
          <p className="mt-4 border-t border-border pt-4 text-sm">
            <span className="font-medium">{copy.saved}</span>{" "}
            <Link
              href="/account"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {copy.findAgain.link}
            </Link>
            {copy.findAgain.after}
            <Link
              href={`/track/${encodeURIComponent(order.reference)}`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {copy.track.link}
            </Link>
            {copy.track.after}
          </p>
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
            {copy.tabOnly.before}
            <Link
              href="/sign-in"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {copy.tabOnly.link}
            </Link>
            {copy.tabOnly.after}
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <h2 className="font-display text-lg font-medium">{copy.next}</h2>
          <ol className="mt-4 space-y-4">
            {/* Where the request went is the first thing this screen owes the
                customer, and it is different for the two cases. A signed-in
                request is written to MalFleks and the branch is emailed to
                confirm it; a signed-out one never leaves this tab (see
                `OrderRequestForm`). This step used to say "has already
                reached MalFleks and the branch" to both. */}
            <Step n={1}>
              {order.savedToAccount ? (
                <>
                  {copy.step1Saved.before}
                  <Link
                    href={`/pay/${encodeURIComponent(order.reference)}`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {copy.step1Saved.link}
                  </Link>
                  {copy.step1Saved.after(order.branch.name)}
                </>
              ) : (
                <>
                  {copy.step1Unsaved(order.branch.name, brandDelivered)}
                </>
              )}
            </Step>
            <Step n={2}>
              {brandDelivered ? (
                <>
                  {copy.step2Brand(order.branch.name, order.brand.name)}
                  {order.branch.phone ? (
                    <>
                      {copy.step2BrandCall(order.branch.phone)}
                    </>
                  ) : (
                    <>
                      {copy.step2BrandNoPhone.before(order.branch.city)}
                      <Link href={branchHref} className="underline underline-offset-2 hover:text-foreground">
                        {copy.step2BrandNoPhone.link}
                      </Link>
                      {copy.step2BrandNoPhone.after}
                    </>
                  )}
                </>
              ) : (
                <>
                  {copy.step2Agent(order.branch.name, carrierLabel(order.route.carrier, locale), order.branch.city)}
                  {order.route.agentPhone ? (
                    <>
                      {copy.step2AgentCall(order.route.agentPhone)}
                    </>
                  ) : (
                    <>
                      {copy.step2AgentNoPhone.before}
                      <Link href="/agents" className="underline underline-offset-2 hover:text-foreground">
                        {copy.step2AgentNoPhone.link}
                      </Link>
                      {copy.step2AgentNoPhone.after}
                    </>
                  )}
                </>
              )}
            </Step>
            <Step n={3}>
              {order.savedToAccount ? (
                <>
                  {copy.step3Saved.before}
                  <Link
                    href={`/pay/${encodeURIComponent(order.reference)}`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {copy.step3Saved.link}
                  </Link>
                  {copy.step3Saved.after}
                </>
              ) : (
                <>
                  {copy.step3Unsaved(brandDelivered)}
                </>
              )}
            </Step>
          </ol>

          <h2 className="mt-10 font-display text-lg font-medium">
            {copy.where}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted">{copy.name}</dt>
              <dd className="mt-0.5">{order.customer.fullName}</dd>
            </div>
            <div>
              <dt className="text-muted">{copy.phone}</dt>
              <dd className="mt-0.5">{formatPhone(order.customer.phone)}</dd>
            </div>
            <div>
              <dt className="text-muted">{copy.address}</dt>
              <dd className="mt-0.5 whitespace-pre-line">
                {order.customer.address}
              </dd>
            </div>
          </dl>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href={`/products/${order.product.id}`}
              className="rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {copy.back(order.product.name)}
            </Link>
            <Link
              href="/search"
              className="rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              {copy.keepBrowsing}
            </Link>
          </div>
        </div>

        <OrderSummary
          product={order.product}
          quantity={order.quantity}
          lineTotalTZS={order.lineTotalTZS}
          route={{
            kind: order.route.kind,
            carrier: order.route.carrier,
            etaEstimate: order.route.etaEstimate,
          }}
          branch={order.branch}
          locale={locale}
        />
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted">
        {n}
      </span>
      <span className="text-sm text-muted">{children}</span>
    </li>
  );
}
