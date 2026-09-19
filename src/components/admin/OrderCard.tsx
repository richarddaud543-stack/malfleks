"use client";

import { useState, useTransition } from "react";
import {
  cancelOrder,
  confirmOrder,
  markOrderFulfilled,
  sendPaymentLink,
} from "@/app/actions/orders";
import OrderTrackingMap from "@/components/locator/OrderTrackingMap";
import type { ListedOrder } from "@/server/orders/list-orders";
import type { DeliveryPingView } from "@/server/orders/tracking";
import { formatTZS } from "@/lib/format";
import { formatPhone } from "@/lib/order";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

/**
 * One order in the admin queue: the record `/admin/orders` used to render
 * inline, plus the status-appropriate transition controls.
 *
 * Mirrors `ApplicationReviewCard`'s shape: every state-changing action is
 * two-step (armed, then confirmed) and per-card, cancelling asks for a
 * reason inline, `useTransition` drives the pending state, and nothing here
 * uses `window.confirm()` — unstyled, unannounced, and it blocks the tab.
 *
 * One deliberate departure from `ApplicationReviewCard`'s literal labels:
 * the domain action here is itself called "Cancel", so the *abort this
 * sub-flow* button is labelled "Back" instead of reusing "Cancel" — reusing
 * it would put two buttons meaning different things on screen with the same
 * name in the cancelling flow.
 */

type Mode = "idle" | "confirming" | "fulfilling" | "cancelling" | "paying";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-accent/10 text-accent",
  confirmed: "bg-accent-2/10 text-accent-2",
  fulfilled: "bg-emerald-600/10 text-emerald-600",
  cancelled: "bg-red-600/10 text-red-600",
};

const PAYMENT_STYLE: Record<string, string> = {
  pending: "bg-accent/10 text-accent",
  captured: "bg-emerald-600/10 text-emerald-600",
  failed: "bg-red-600/10 text-red-600",
};

const PAYMENT_LABEL: Record<string, string> = {
  pending: "payment link sent",
  captured: "paid",
  failed: "payment failed",
};

function paymentErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case "wrong-status":
      return "Only a confirmed order can be sent a payment link.";
    case "unquotable":
      return "No delivery fee is set for this route yet, so there's no total to charge.";
    case "already-paid":
      return "This order is already paid.";
    case "checkout-link-failed":
      return "ClickPesa didn't return a checkout link. Try again in a moment.";
    case "not-found":
      return "This order no longer exists.";
    case "forbidden":
      return "Your session no longer has admin access. Sign in again.";
    default:
      return "Couldn't create a payment link. Nothing changed — try again.";
  }
}

function errorMessage(reason: string | undefined): string {
  switch (reason) {
    case "forbidden":
      return "Your session no longer has admin access. Sign in again.";
    case "invalid-transition":
      return "Someone already moved this order. Reload to see its current state.";
    case "not-found":
      return "This order no longer exists.";
    default:
      return "Couldn't record the decision. Nothing changed — try again.";
  }
}

export default function OrderCard({
  order,
  lastPing = null,
}: {
  order: ListedOrder;
  /** This order's newest `DeliveryPing`, if any — see the note on why the
   *  page only ever queries this for `"confirmed"`/`"fulfilled"` orders. */
  lastPing?: DeliveryPingView | null;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(
    order.payment?.status === "pending" ? order.payment.checkoutLink : null
  );
  const [pending, startTransition] = useTransition();

  function run(work: () => Promise<{ ok: boolean; reason?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setMode("idle");
      if (result.ok) return; // revalidatePath refreshes the badge and controls
      setError(errorMessage(result.reason));
    });
  }

  function runPayment() {
    setError(null);
    startTransition(async () => {
      const result = await sendPaymentLink(order.id);
      setMode("idle");
      if (result.ok) {
        setPaymentLink(result.checkoutLink);
        return;
      }
      setError(paymentErrorMessage(result.reason));
    });
  }

  const canAct = order.status === "pending" || order.status === "confirmed";
  const trimmedReason = reason.trim();

  return (
    <li className="glass-card rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-muted">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                STATUS_STYLE[order.status] ?? "bg-border/40 text-muted"
              }`}
            >
              {order.status}
            </span>
            {order.payment && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                  PAYMENT_STYLE[order.payment.status] ?? "bg-border/40 text-muted"
                }`}
              >
                {PAYMENT_LABEL[order.payment.status] ?? order.payment.status}
              </span>
            )}
            <span className="font-mono">{order.reference}</span>
          </p>
          <h3 className="font-display mt-1 text-lg font-medium">
            {order.productName} × {order.quantity}
          </h3>
        </div>
        <time
          dateTime={order.requestedAt}
          className="text-xs text-muted tabular-nums"
        >
          {new Date(order.requestedAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Customer</dt>
          <dd className="mt-0.5">{order.customerFullName}</dd>
        </div>
        <div>
          <dt className="text-muted">Phone</dt>
          <dd className="mt-0.5 font-mono text-xs">
            {formatPhone(order.customerPhone)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Delivery address</dt>
          <dd className="mt-0.5">{order.customerAddress}</dd>
        </div>
        <div>
          <dt className="text-muted">Line total</dt>
          <dd className="mt-0.5 tabular-nums">{formatTZS(order.lineTotalTZS)}</dd>
        </div>
        <div>
          <dt className="text-muted">Brand</dt>
          <dd className="mt-0.5">{order.brandName}</dd>
        </div>
        <div>
          <dt className="text-muted">Branch</dt>
          <dd className="mt-0.5">
            {order.branchName}
            <span className="text-muted"> — {order.branchCity}</span>
          </dd>
        </div>
        {order.branchPhone && (
          <div>
            <dt className="text-muted">Branch phone</dt>
            <dd className="mt-0.5 font-mono text-xs">{order.branchPhone}</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-muted">Route</dt>
          <dd className="mt-0.5">
            {order.routeCarrier}
            {order.routeKind === "agent" && order.routeAgentPhone && (
              <span className="text-muted"> — {formatPhone(order.routeAgentPhone)}</span>
            )}
            {order.routeEtaEstimate && (
              <span className="text-muted"> · {order.routeEtaEstimate}</span>
            )}
          </dd>
        </div>
        {order.decisionNote && (
          <div className="sm:col-span-2">
            <dt className="text-muted">
              {order.status === "cancelled" ? "Why it was cancelled" : "Note"}
            </dt>
            <dd className="mt-0.5 whitespace-pre-line">{order.decisionNote}</dd>
          </div>
        )}
      </dl>

      {/* Only appears once the branch or courier has actually reported a
          position — see the note on `postDeliveryPing`'s `"confirmed"`-only
          gate. No control here moves anything; this is read-only, the same
          way the rest of this card's data is until a transition button is
          pressed. */}
      {lastPing && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs text-muted">
            Last reported {timeAgo(lastPing.createdAt)}
            {lastPing.note ? ` · ${lastPing.note}` : ""}
          </p>
          <div className="mt-2 max-w-[220px] overflow-hidden rounded-lg border border-border">
            <OrderTrackingMap
              position={{ lat: lastPing.latitude, lng: lastPing.longitude }}
            />
          </div>
        </div>
      )}

      {paymentLink && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs text-muted">
            Payment link — copy and send this to the customer yourself
            (SMS/WhatsApp). Nothing here sends it for you.
          </p>
          <p className="mt-1.5 break-all font-mono text-xs text-foreground select-all">
            {paymentLink}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {canAct && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {mode === "idle" && order.status === "pending" && (
            <>
              <button
                type="button"
                onClick={() => setMode("confirming")}
                aria-label={`Confirm ${order.reference}`}
                className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setMode("cancelling")}
                aria-label={`Cancel ${order.reference}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
              >
                Cancel
              </button>
              <span className="ml-auto text-xs text-muted">
                Confirms availability and price with the branch. No payment moves.
              </span>
            </>
          )}

          {mode === "idle" && order.status === "confirmed" && (
            <>
              <button
                type="button"
                onClick={() => setMode("fulfilling")}
                aria-label={`Mark ${order.reference} fulfilled`}
                className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-background"
              >
                Mark fulfilled
              </button>
              {order.payment?.status !== "captured" && (
                <button
                  type="button"
                  onClick={() => setMode("paying")}
                  aria-label={`Send a payment link for ${order.reference}`}
                  className="rounded-full border border-accent-2 px-4 py-1.5 text-sm font-medium text-accent-2 transition-colors hover:bg-accent-2 hover:text-background"
                >
                  {order.payment?.status === "pending"
                    ? "View payment link"
                    : "Send payment link"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("cancelling")}
                aria-label={`Cancel ${order.reference}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-red-600/40 hover:text-red-600"
              >
                Cancel
              </button>
            </>
          )}

          {mode === "paying" && (
            <>
              <span className="mr-auto text-sm text-muted">
                Create a ClickPesa payment link for {order.reference}? You send it
                to the customer yourself — nothing here does that automatically.
              </span>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={runPayment}
                aria-label={`Yes, create a payment link for ${order.reference}`}
                className="rounded-full border border-accent-2 bg-accent-2 px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "Creating…" : "Yes, create link"}
              </button>
            </>
          )}

          {mode === "confirming" && (
            <>
              <span className="mr-auto text-sm text-muted">
                Confirm {order.reference} is available at the quoted price and
                delivery is proceeding?
              </span>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => confirmOrder(order.id))}
                aria-label={`Yes, confirm ${order.reference}`}
                className="rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "Confirming…" : "Yes, confirm"}
              </button>
            </>
          )}

          {mode === "fulfilling" && (
            <>
              <span className="mr-auto text-sm text-muted">
                Mark {order.reference} as delivered / handed off?
              </span>
              <button
                type="button"
                onClick={() => setMode("idle")}
                disabled={pending}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => markOrderFulfilled(order.id))}
                aria-label={`Yes, mark ${order.reference} fulfilled`}
                className="rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? "Marking…" : "Yes, mark fulfilled"}
              </button>
            </>
          )}

          {mode === "cancelling" && (
            <div className="w-full">
              <label
                htmlFor={`cancel-reason-${order.id}`}
                className="block text-sm font-medium"
              >
                Why is this being cancelled?
              </label>
              <p className="mt-1 text-xs text-muted">
                Stored with the decision — out of stock, branch declined, or
                the customer was unreachable or withdrew.
              </p>
              <input
                id={`cancel-reason-${order.id}`}
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm outline-none hover:border-foreground/30"
              />
              <div className="mt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMode("idle");
                    setReason("");
                  }}
                  disabled={pending}
                  className="rounded-full border border-border px-4 py-1.5 text-sm text-muted disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={pending || trimmedReason === ""}
                  onClick={() => run(() => cancelOrder(order.id, reason))}
                  aria-label={`Confirm cancellation of ${order.reference}`}
                  className="rounded-full border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"
                >
                  {pending ? "Cancelling…" : "Cancel order"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
