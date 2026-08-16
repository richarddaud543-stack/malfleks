import Link from "next/link";
import { formatTZS } from "@/lib/format";
import { deliveryRouteLabel, formatPhone } from "@/lib/order";
import type { SavedOrderRequest } from "@/server/orders/saved-requests";

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
}: {
  request: SavedOrderRequest;
}) {
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
    </li>
  );
}
