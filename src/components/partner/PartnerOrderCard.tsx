import { formatTZS } from "@/lib/format";
import type { ListedOrder } from "@/server/orders/list-orders";
import type { DeliveryPingView } from "@/server/orders/tracking";
import DeliveryPingButton from "./DeliveryPingButton";
import MarkFulfilledButton from "./MarkFulfilledButton";

/**
 * One customer order, as the branch that has to fulfil it needs to see it.
 *
 * Deliberately different from `OrderCard` on `/admin/orders`, which is built
 * for someone triaging a queue. A shopkeeper opening this on a phone needs
 * three things in the first line of sight — **who to call, what they want, and
 * the reference** — so the phone number is a `tel:` link and the reference is
 * the largest thing on the card after the product.
 *
 * One status button exists here, deliberately narrow: `MarkFulfilledButton`,
 * shown only on a `confirmed` order. Every other move between pending,
 * confirmed and cancelled stays MalFleks admin's, through the guarded
 * transitions in `src/server/orders/status.ts` — see that module's doc
 * comment for why `fulfilled` is the one transition where the partner, not
 * admin, is the person who actually knows the answer.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "New — waiting on you",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  fulfilled: "Fulfilled",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-accent/15 text-accent",
  confirmed: "bg-foreground/10 text-foreground",
  cancelled: "bg-red-600/10 text-red-700 dark:text-red-400",
  fulfilled: "bg-foreground/10 text-muted",
};

export default function PartnerOrderCard({
  order,
  lastPing = null,
}: {
  order: ListedOrder;
  /** This order's newest `DeliveryPing`, or `null` — only meaningful (and
   *  only fetched by the page) once the order is `"confirmed"`. */
  lastPing?: DeliveryPingView | null;
}) {
  return (
    <li className="glass-card rounded-2xl px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-medium">
            {order.quantity > 1 && `${order.quantity} × `}
            {order.productName}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatTZS(order.lineTotalTZS)}
            {order.quantity > 1 &&
              ` · ${formatTZS(order.unitPriceTZS)} each`}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            STATUS_CLASS[order.status] ?? "bg-foreground/10"
          }`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
        <p className="text-xs text-muted">Reference to quote</p>
        <p className="font-display text-xl font-medium tracking-tight tabular-nums">
          {order.reference}
        </p>
      </div>

      <div className="mt-4 grid gap-1 text-sm">
        <p className="font-medium">{order.customerFullName}</p>
        {/* The one thing this page exists for. */}
        <a
          href={`tel:${order.customerPhone}`}
          className="text-accent underline decoration-border underline-offset-4"
        >
          {order.customerPhone}
        </a>
        <p className="text-muted">{order.customerAddress}</p>
      </div>

      <p className="mt-4 text-xs text-muted">
        {order.routeKind === "branch"
          ? "You are delivering this one yourself."
          : `Delivery by ${order.routeCarrier}${
              order.routeEtaEstimate ? `, ${order.routeEtaEstimate}` : ""
            }.`}
        {order.routeAgentPhone && ` Courier: ${order.routeAgentPhone}.`}
      </p>

      {/* Both controls only apply to a confirmed order — see
          `postDeliveryPing` and `markOrderFulfilledByPartner`'s own notes on
          why `pending`/`cancelled`/`fulfilled` don't get them at all, rather
          than a disabled version of them. */}
      {order.status === "confirmed" && (
        <>
          <DeliveryPingButton orderId={order.id} initialPing={lastPing} />
          <MarkFulfilledButton orderId={order.id} />
        </>
      )}

      <p className="mt-2 text-xs text-muted">
        Requested{" "}
        {new Date(order.requestedAt).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </li>
  );
}
