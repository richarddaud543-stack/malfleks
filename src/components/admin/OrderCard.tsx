"use client";

import { useState, useTransition } from "react";
import {
  cancelOrder,
  confirmOrder,
  markOrderFulfilled,
} from "@/app/actions/orders";
import type { ListedOrder } from "@/server/orders/list-orders";
import { formatTZS } from "@/lib/format";
import { formatPhone } from "@/lib/order";

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

type Mode = "idle" | "confirming" | "fulfilling" | "cancelling";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-accent/10 text-accent",
  confirmed: "bg-accent-2/10 text-accent-2",
  fulfilled: "bg-emerald-600/10 text-emerald-600",
  cancelled: "bg-red-600/10 text-red-600",
};

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

export default function OrderCard({ order }: { order: ListedOrder }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
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
