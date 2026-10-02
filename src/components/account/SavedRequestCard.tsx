import Link from "next/link";
import { formatTZS } from "@/lib/format";
import { deliveryRouteLabel, formatPhone } from "@/lib/order";
import type { AccountOrderStatus } from "@/server/orders/checkout";
import type { SavedOrderRequest } from "@/server/orders/saved-requests";
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
}: {
  request: SavedOrderRequest;
  /**
   * Where the order behind this request stands: waiting on the branch, ready
   * to pay, paid, delivered or cancelled. `null` when MalFleks holds no order
   * for it (it predates orders being kept) or the status could not be read.
   */
  status?: AccountOrderStatus | null;
}) {
  const state = status?.state ?? null;
  // A cancelled order has nothing to track, and "Track this order" under it
  // read as though it were still on its way. A delivered one keeps the link,
  // named for what it now is: a record.
  const trackLabel =
    state === "cancelled" ? null : state === "delivered" ? "See the delivery record" : "Track this order";

  const branchHref = `/brands/${request.brand.slug ?? request.brand.id}/branches/${request.branch.id}`;
  const requestedAt = new Date(request.requestedAt);
  const dateIsUsable = !Number.isNaN(requestedAt.getTime());

  return (
    <li className="glass-card rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            Your reference
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
            {requestedAt.toLocaleDateString("en-GB", {
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
          <dt className="text-muted">Quantity</dt>
          <dd className="mt-0.5">{request.quantity}</dd>
        </div>
        <div>
          <dt className="text-muted">Total</dt>
          <dd className="mt-0.5">{formatTZS(request.lineTotalTZS)}</dd>
        </div>
        <div>
          <dt className="text-muted">{deliveryRouteLabel(request.route.kind)}</dt>
          <dd className="mt-0.5">
            {request.route.carrier}
            {request.route.etaEstimate ? ` · ${request.route.etaEstimate}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Branch</dt>
          <dd className="mt-0.5">
            <Link href={branchHref} className="underline-offset-4 hover:underline">
              {request.branch.name}
            </Link>
            , {request.branch.city}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Delivering to</dt>
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
              <span className="font-medium">Not paid yet.</span> Pay to place this order with the branch.
            </>
          )}
          {state === "waiting" && (
            <>
              <span className="font-medium">Waiting for the branch to confirm the price and delivery.</span> Nothing is due yet —
              you&apos;ll pay here once they do.
            </>
          )}
          {state === "paid" && (
            <>
              <span className="font-medium">Paid.</span> MalFleks holds your payment until it is delivered.
            </>
          )}
          {state === "delivered" && (
            <>
              <span className="font-medium">Delivered.</span> This order has been marked delivered. Thank you for buying
              through MalFleks.
            </>
          )}
          {state === "cancelled" && (
            <>
              <span className="font-medium">Cancelled.</span>{" "}
              {status?.cancelReason ? `The reason given: ${status.cancelReason}. ` : "This order will not be delivered. "}
              {status?.refundDue
                ? "Your payment will be refunded — we email you when the refund has been sent."
                : "You have not been charged."}
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
            Pay now
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
