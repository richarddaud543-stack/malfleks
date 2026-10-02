"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { checkoutStatusAction, checkPaymentNowAction } from "@/app/actions/checkout";
import { formatTZS } from "@/lib/format";
import { formatPhone } from "@/lib/order";
import type { CheckoutView } from "@/server/orders/checkout";

/** How often the page re-reads the order while it is waiting on something. A database read, not a ClickPesa call. */
const POLL_MS = 8_000;

/**
 * The customer's checkout for one order.
 *
 * Paying itself happens on ClickPesa's hosted page — that is where the
 * customer picks a network and approves the charge on their phone — so this
 * panel's job is everything around it: say exactly what is being paid for and
 * how much, hand over to ClickPesa, and then notice the payment landing
 * without the customer having to reload.
 *
 * While the order is waiting on the branch or on a payment, the panel
 * re-reads its state every few seconds. "I've paid" asks ClickPesa directly
 * (the server allows that once a minute), for the case where the customer is
 * back before ClickPesa's own notification has arrived.
 */
export default function PayPanel({ initial }: { initial: CheckoutView }) {
  const [view, setView] = useState(initial);
  const [checking, startCheck] = useTransition();
  const [checkedOnce, setCheckedOnce] = useState(false);
  const [leftToPay, setLeftToPay] = useState(false);

  const live = view.state === "waiting" || view.state === "ready";

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      // No point polling a tab nobody is looking at.
      if (document.visibilityState !== "visible") return;
      const next = await checkoutStatusAction(view.reference);
      if (!cancelled && next) setView(next);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [live, view.reference]);

  const checkNow = () =>
    startCheck(async () => {
      const next = await checkPaymentNowAction(view.reference);
      if (next) setView(next);
      setCheckedOnce(true);
    });

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
      <div className="glass-card rounded-2xl p-6" aria-live="polite">
        {view.state === "waiting" && (
          <>
            <StateHeading tone="wait">Waiting for the branch</StateHeading>
            <p className="mt-2 text-sm text-muted">
              This order needs {view.branchName} to confirm the price and delivery before it can be paid for. Nothing is due yet —
              this page opens for payment as soon as they do, and we&apos;ll email you too. You can leave it open; it updates on
              its own.
            </p>
          </>
        )}

        {view.state === "ready" && view.checkoutLink && view.totalTZS !== null && (
          <>
            <StateHeading tone="go">{view.orderStatus === "confirmed" ? "Confirmed — ready to pay" : "Pay to place your order"}</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {view.orderStatus === "confirmed"
                ? `${view.branchName} has it in stock at this price. Pay by mobile money to complete your order.`
                : `Pay by mobile money and your order goes to ${view.branchName} straight away. If they can't supply it, you are refunded in full.`}
            </p>

            <a
              href={view.checkoutLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setLeftToPay(true)}
              className="btn-pill btn-lime mt-6 inline-block px-7 py-3 text-base font-medium"
              data-testid="pay-button"
            >
              Pay {formatTZS(view.totalTZS)}
            </a>
            <p className="mt-3 text-xs text-muted">
              Opens ClickPesa&apos;s secure payment page in a new tab. You choose your mobile money network there and approve the payment
              on your phone. MalFleks never sees your PIN.
            </p>

            {view.lastAttemptFailed && (
              <p role="status" className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">
                Your last attempt didn&apos;t go through, and nothing was taken. You can try again with the same button.
              </p>
            )}

            {(leftToPay || checkedOnce) && (
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-medium">Paid already?</p>
                <p className="mt-1 text-sm text-muted">
                  It usually shows here within a minute. If it hasn&apos;t, ask ClickPesa now.
                </p>
                <button
                  type="button"
                  onClick={checkNow}
                  disabled={checking}
                  className="btn-pill btn-ink mt-3 px-5 py-2 text-sm disabled:opacity-60"
                >
                  {checking ? "Checking…" : "I've paid — check now"}
                </button>
                {checkedOnce && !checking && (
                  <p role="status" className="mt-3 text-sm text-muted">
                    Not received yet. If your phone showed the payment as successful, give it a minute and check again — you won&apos;t be
                    charged twice for pressing this.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {view.state === "paid" && (
          <>
            <StateHeading tone="done">Paid — thank you</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {view.totalTZS !== null ? `We've received ${formatTZS(view.totalTZS)}. ` : "We've received your payment. "}
              {view.branchName} has been told to deliver your order, and MalFleks holds your payment until it arrives.
            </p>
            {view.paymentReference && (
              <p className="mt-3 text-sm">
                Payment reference <span className="font-mono">{view.paymentReference}</span>
              </p>
            )}
            <Link href={`/track/${encodeURIComponent(view.reference)}`} className="btn-pill btn-ink mt-6 inline-block px-5 py-2 text-sm">
              Track your delivery
            </Link>
          </>
        )}

        {view.state === "cancelled" && (
          <>
            <StateHeading tone="stop">This order was cancelled</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {view.cancelReason ? `Reason given: ${view.cancelReason}. ` : ""}
              Nothing is due.
            </p>
            <Link href="/search" className="btn-pill btn-ink mt-6 inline-block px-5 py-2 text-sm">
              Browse products
            </Link>
          </>
        )}

        {view.state === "unavailable" && (
          <>
            <StateHeading tone="wait">Payment isn&apos;t open for this order yet</StateHeading>
            <p className="mt-2 text-sm text-muted">
              The order is confirmed, but we couldn&apos;t open the payment page just now. Nothing has been charged. Try again in a few
              minutes, or{" "}
              <Link href="/contact" className="underline underline-offset-2 hover:text-foreground">
                contact us
              </Link>{" "}
              with your reference.
            </p>
          </>
        )}
      </div>

      <aside className="glass-card rounded-2xl p-6 text-sm" aria-label="Order summary">
        <h2 className="font-display text-lg font-medium">Your order</h2>
        <dl className="mt-4 space-y-3">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {view.quantity} × {view.productName}
            </dt>
            <dd className="tabular-nums">{formatTZS(view.goodsTZS)}</dd>
          </div>
          {view.deliveryFeeTZS > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Delivery ({view.routeCarrier})</dt>
              <dd className="tabular-nums">{formatTZS(view.deliveryFeeTZS)}</dd>
            </div>
          )}
          {view.totalTZS !== null && (
            <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="pay-total">
                {formatTZS(view.totalTZS)}
              </dd>
            </div>
          )}
        </dl>
        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted">
          <div>
            <dt className="inline">From </dt>
            <dd className="inline text-foreground">
              {view.branchName}
              {view.branchName.includes(view.branchCity) ? "" : `, ${view.branchCity}`}
            </dd>
          </div>
          <div>
            <dt className="inline">Delivered by </dt>
            <dd className="inline text-foreground">{view.routeCarrier}</dd>
          </div>
          <div>
            <dt className="inline">Your number </dt>
            <dd className="inline text-foreground">{formatPhone(view.customerPhone)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

const DOT: Record<string, string> = {
  wait: "bg-amber-500",
  go: "bg-[var(--lime)]",
  done: "bg-emerald-600",
  stop: "bg-red-600",
};

function StateHeading({ tone, children }: { tone: keyof typeof DOT; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 font-display text-xl font-medium">
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[tone]}`} />
      {children}
    </h2>
  );
}
