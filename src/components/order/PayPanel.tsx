"use client";

import Link from "next/link";
import SafePay from "@/components/trust/SafePay";
import { useEffect, useState, useTransition } from "react";

import { checkoutStatusAction, checkPaymentNowAction } from "@/app/actions/checkout";
import { useLocale } from "@/i18n/client";
import { orderNoteLabel } from "@/i18n/copy/account";
import { carrierLabel, ORDER } from "@/i18n/copy/order";
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
  const locale = useLocale();
  const copy = ORDER[locale].pay;
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
            <StateHeading tone="wait">{copy.waitingHeading}</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {copy.waitingBody(view.branchName)}
            </p>
          </>
        )}

        {view.state === "ready" && view.checkoutLink && view.totalTZS !== null && (
          <>
            <StateHeading tone="go">{view.orderStatus === "confirmed" ? copy.readyConfirmed : copy.readyNew}</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {view.orderStatus === "confirmed"
                ? copy.readyConfirmedBody(view.branchName)
                : copy.readyNewBody(view.branchName)}
            </p>

            <a
              href={view.checkoutLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setLeftToPay(true)}
              className="btn-pill btn-lime mt-6 inline-block px-7 py-3 text-base font-medium"
              data-testid="pay-button"
            >
              {copy.payAmount(formatTZS(view.totalTZS))}
            </a>
            <p className="mt-3 text-xs text-muted">
              {copy.opens}
            </p>

            {view.lastAttemptFailed && (
              <p role="status" className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">
                {copy.lastFailed}
              </p>
            )}

            {(leftToPay || checkedOnce) && (
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-medium">{copy.paidAlready}</p>
                <p className="mt-1 text-sm text-muted">
                  {copy.paidAlreadyBody}
                </p>
                <button
                  type="button"
                  onClick={checkNow}
                  disabled={checking}
                  className="btn-pill btn-ink mt-3 px-5 py-2 text-sm disabled:opacity-60"
                >
                  {checking ? copy.checking : copy.checkNow}
                </button>
                {checkedOnce && !checking && (
                  <p role="status" className="mt-3 text-sm text-muted">
                    {copy.notYet}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {view.state === "paid" && (
          <>
            <StateHeading tone="done">{copy.paidHeading}</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {view.totalTZS !== null ? copy.received(formatTZS(view.totalTZS)) : copy.receivedPlain}
              {copy.paidBody(view.branchName)}
            </p>
            {view.paymentReference && (
              <p className="mt-3 text-sm">
                {copy.paymentReference} <span className="font-mono">{view.paymentReference}</span>
              </p>
            )}
            <Link href={`/track/${encodeURIComponent(view.reference)}`} className="btn-pill btn-ink mt-6 inline-block px-5 py-2 text-sm">
              {copy.track}
            </Link>
          </>
        )}

        {view.state === "cancelled" && (
          <>
            <StateHeading tone="stop">{copy.cancelledHeading}</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {view.cancelReason ? copy.reasonGiven(orderNoteLabel(view.cancelReason, locale)) : ""}
              {copy.nothingDue}
            </p>
            <Link href="/search" className="btn-pill btn-ink mt-6 inline-block px-5 py-2 text-sm">
              {copy.browse}
            </Link>
          </>
        )}

        {view.state === "unavailable" && (
          <>
            <StateHeading tone="wait">{copy.unavailableHeading}</StateHeading>
            <p className="mt-2 text-sm text-muted">
              {copy.unavailable.before}
              <Link href="/contact" className="underline underline-offset-2 hover:text-foreground">
                {copy.unavailable.link}
              </Link>
              {copy.unavailable.after}
            </p>
          </>
        )}
      </div>

      <div className="space-y-4">
      <aside className="glass-card rounded-2xl p-6 text-sm" aria-label={copy.summaryLabel}>
        <h2 className="font-display text-lg font-medium">{copy.yourOrder}</h2>
        <dl className="mt-4 space-y-3">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {view.quantity} × {view.productName}
            </dt>
            <dd className="tabular-nums">{formatTZS(view.goodsTZS)}</dd>
          </div>
          {view.deliveryFeeTZS > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{copy.delivery(carrierLabel(view.routeCarrier, locale))}</dt>
              <dd className="tabular-nums">{formatTZS(view.deliveryFeeTZS)}</dd>
            </div>
          )}
          {view.totalTZS !== null && (
            <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
              <dt>{copy.total}</dt>
              <dd className="tabular-nums" data-testid="pay-total">
                {formatTZS(view.totalTZS)}
              </dd>
            </div>
          )}
        </dl>
        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted">
          <div>
            <dt className="inline">{copy.from} </dt>
            <dd className="inline text-foreground">
              {view.branchName}
              {view.branchName.includes(view.branchCity) ? "" : `, ${view.branchCity}`}
            </dd>
          </div>
          <div>
            <dt className="inline">{copy.deliveredBy} </dt>
            <dd className="inline text-foreground">{carrierLabel(view.routeCarrier, locale)}</dd>
          </div>
          <div>
            <dt className="inline">{copy.yourNumber} </dt>
            <dd className="inline text-foreground">{formatPhone(view.customerPhone)}</dd>
          </div>
        </dl>
      </aside>
      {view.state !== "cancelled" && <SafePay compact locale={locale} />}
      </div>
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
