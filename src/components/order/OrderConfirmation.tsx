"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ORDER_STORAGE_KEY,
  formatPhone,
  parseOrderRequest,
  type OrderRequest,
} from "@/lib/order";
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
        Loading your request…
      </p>
    );
  }

  if (order === null) {
    return (
      <div className="glass-card rounded-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-medium">
          No order request to show
        </h1>
        <p className="mt-3 text-sm text-muted">
          Requests are held in this browser tab only — a different tab, or a
          session that has since closed, won&apos;t have it. Nothing was sent
          anywhere.
        </p>
        <Link
          href="/search"
          className="btn-pill btn-lime mt-8 px-6 py-2.5 text-sm"
        >
          Browse products
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
        Request ready
      </p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">
        Your request for {order.product.name}
      </h1>

      <div className="glass-card mt-8 rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wide text-muted">
          Your reference
        </p>
        <p
          data-testid="order-reference"
          className="mt-2 font-mono text-3xl font-medium tracking-[0.2em]"
        >
          {order.reference}
        </p>
        <p className="mt-3 text-sm text-muted">
          Quote this when you contact{" "}
          {brandDelivered ? "the branch" : "the branch or the agent"}. It was
          generated here, in your browser.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <h2 className="font-display text-lg font-medium">What happens next</h2>
          <ol className="mt-4 space-y-4">
            <Step n={1}>
              Nothing has been paid and nothing has been reserved. Soko has no
              order system behind it yet, so this request has not been
              transmitted to anyone — it is yours to take to the branch.
            </Step>
            <Step n={2}>
              {brandDelivered ? (
                <>
                  {order.branch.name} runs its own delivery, so{" "}
                  {order.brand.name} will handle pickup and drop-off.{" "}
                  {order.branch.phone ? (
                    <>
                      Call the branch on {order.branch.phone} to confirm stock
                      and agree a delivery time.
                    </>
                  ) : (
                    <>
                      We don&apos;t have a published number for this branch, so
                      take your reference to the counter in {order.branch.city}{" "}
                      to confirm stock and agree a delivery time — its{" "}
                      <Link href={branchHref} className="underline underline-offset-2 hover:text-foreground">
                        address and opening hours
                      </Link>{" "}
                      are on the branch page.
                    </>
                  )}
                </>
              ) : (
                <>
                  {order.branch.name} doesn&apos;t deliver, so{" "}
                  {order.route.carrier} — a local agent serving{" "}
                  {order.branch.city} — carries this order.{" "}
                  {order.route.agentPhone ? (
                    <>
                      Call them on {order.route.agentPhone} to arrange
                      collection from the branch.
                    </>
                  ) : (
                    <>
                      Their number is on the{" "}
                      <Link href="/agents" className="underline underline-offset-2 hover:text-foreground">
                        delivery agents page
                      </Link>
                      ; call them to arrange collection from the branch.
                    </>
                  )}
                </>
              )}
            </Step>
            <Step n={3}>
              Payment and delivery charges are agreed directly with{" "}
              {brandDelivered ? "the branch" : "the branch and the agent"}. Soko
              does not take payment.
            </Step>
          </ol>

          <h2 className="mt-10 font-display text-lg font-medium">
            Where it&apos;s going
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted">Name</dt>
              <dd className="mt-0.5">{order.customer.fullName}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd className="mt-0.5">{formatPhone(order.customer.phone)}</dd>
            </div>
            <div>
              <dt className="text-muted">Address</dt>
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
              Back to {order.product.name}
            </Link>
            <Link
              href="/search"
              className="rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              Keep browsing
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
