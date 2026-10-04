import Link from "next/link";
import { ACCOUNT, orderNoteLabel } from "@/i18n/copy/account";
import { carrierLabel } from "@/i18n/copy/order";
import type { Locale } from "@/i18n/locale";
import { formatTZS } from "@/lib/format";
import { deliveryRouteLabel, formatPhone } from "@/lib/order";
import type { AccountOrderStatus } from "@/server/orders/checkout";
import type { SavedOrderRequest } from "@/server/orders/saved-requests";
import CancelOrderButton from "./CancelOrderButton";
import DeleteSavedRequest from "./DeleteSavedRequest";

/**
 * One saved order request.
 *
 * A server component: none of this is interactive, and the data has already
 * been through the DAL by the time it gets here.
 *
 * The reference is the point of the whole card. It is what the customer reads
 * down the phone to a branch, so it is the largest thing on it and uses the
 * monospace face, exactly as on the confirmation screen — the same string in
 * two visually unrelated forms is how people lose confidence they are looking
 * at the same request.
 */
export default function SavedRequestCard({
  request,
  status = null,
  locale = "en",
}: {
  request: SavedOrderRequest;
  /**
   * Where the order behind this request stands: waiting on the branch, ready
   * to pay, paid, delivered or cancelled. `null` when MalFleks holds no order
   * for it (it predates orders being kept) or the status could not be read.
   */
  status?: AccountOrderStatus | null;
  locale?: Locale;
}) {
  const copy = ACCOUNT[locale].card;
  const state = status?.state ?? null;
  // A cancelled order has nothing to track, and "Track this order" under it
  // read as though it were still on its way. A delivered one keeps the link,
  // named for what it now is: a record.
  const trackLabel =
    state === "cancelled" ? null : state === "delivered" ? copy.record : copy.track;

  const branchHref = `/brands/${request.brand.slug ?? request.brand.id}/branches/${request.branch.id}`;
  const requestedAt = new Date(request.requestedAt);
  const dateIsUsable = !Number.isNaN(requestedAt.getTime());

  return (
    <li className="glass-card rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            {copy.reference}
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tracking-[0.18em]">
            {request.reference}
          </p>
        </div>
        {dateIsUsable && (
          <time
            dateTime={requestedAt.toISOString()}
            className="text-sm text-muted"
          >
            {requestedAt.toLocaleDateString(ACCOUNT[locale].dateLocale, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        )}
      </div>

      <h2 className="mt-5 font-display text-lg font-medium">
        <Link
          href={`/products/${request.product.id}`}
          className="underline-offset-4 hover:underline"
        >
          {request.product.name}
        </Link>
      </h2>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{copy.quantity}</dt>
          <dd className="mt-0.5">{request.quantity}</dd>
        </div>
        <div>
          <dt className="text-muted">{copy.total}</dt>
          <dd className="mt-0.5">{formatTZS(request.lineTotalTZS)}</dd>
        </div>
        <div>
          <dt className="text-muted">{deliveryRouteLabel(request.route.kind, locale)}</dt>
          <dd className="mt-0.5">
            {carrierLabel(request.route.carrier, locale)}
            {request.route.etaEstimate ? ` · ${request.route.etaEstimate}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{copy.branch}</dt>
          <dd className="mt-0.5">
            <Link href={branchHref} className="underline-offset-4 hover:underline">
              {request.branch.name}
            </Link>
            , {request.branch.city}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">{copy.deliveringTo}</dt>
          <dd className="mt-0.5 whitespace-pre-line">
            {request.customer.fullName} · {formatPhone(request.customer.phone)}
            {"\n"}
            {request.customer.address}
          </dd>
        </div>
      </dl>

      {state && (
        <p
          data-testid="order-state"
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            state === "cancelled" ? "border-red-600/40 bg-red-600/5" : "border-border bg-surface-2"
          }`}
        >
          {state === "ready" && (
            <>
              <span className="font-medium">{copy.ready.strong}</span>
              {copy.ready.rest}
            </>
          )}
          {state === "waiting" && (
            <>
              <span className="font-medium">{copy.waiting.strong}</span>
              {copy.waiting.rest}
            </>
          )}
          {state === "paid" && (
            <>
              <span className="font-medium">{copy.paid.strong}</span>
              {copy.paid.rest}
            </>
          )}
          {state === "delivered" && (
            <>
              <span className="font-medium">{copy.delivered.strong}</span>
              {copy.delivered.rest}
            </>
          )}
          {state === "cancelled" && (
            <>
              <span className="font-medium">{copy.cancelled}</span>{" "}
              {status?.cancelReason ? copy.reason(orderNoteLabel(status.cancelReason, locale)) : copy.notDelivered}
              {status?.refundDue
                ? copy.refundDue
                : copy.notCharged}
            </>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {state === "ready" && (
          <Link
            href={`/pay/${encodeURIComponent(request.reference)}`}
            className="btn-pill btn-lime px-5"
          >
            {copy.payNow}
          </Link>
        )}
        {trackLabel && (
          <Link
            href={`/track/${encodeURIComponent(request.reference)}`}
            className="btn-pill btn-ink px-4"
          >
            {trackLabel}
          </Link>
        )}
        {/* Their own way out: cancel outright while unpaid, ask once paid.
            Nothing to offer on an order that is delivered or cancelled. */}
        {(state === "ready" || state === "waiting" || state === "paid") && (
          <CancelOrderButton reference={request.reference} paid={state === "paid"} />
        )}
        {/* The only other interactive part of an otherwise static card, so it
            is the only other part that is a client component. While the order
            is confirmed -- unpaid, or paid and on its way -- this card is the
            customer's only way back to Pay and Track, so Remove is replaced
            by a sentence saying why (and `deleteOrderRequest` refuses too). */}
        <DeleteSavedRequest
          id={request.id}
          reference={request.reference}
          blocked={
            status?.keepSavedCopy
              ? state === "ready"
                ? "unpaid"
                : "undelivered"
              : null
          }
        />
      </div>
    </li>
  );
}
