import { formatTZS } from "@/lib/format";
import { displayPhone } from "@/lib/order";
import type { ListedOrder } from "@/server/orders/list-orders";
import type { DeliveryPingView } from "@/server/orders/tracking";
import BranchDecisionButtons from "./BranchDecisionButtons";
import DeliveryPingButton from "./DeliveryPingButton";
import MarkFulfilledButton from "./MarkFulfilledButton";

/**
 * One customer order, as the branch that has to fulfil it needs to see it.
 *
 * Deliberately different from the admin order page (`/admin/orders/[id]`), which is built
 * for someone triaging a queue. A shopkeeper opening this on a phone needs
 * three things in the first line of sight — **who to call, what they want, and
 * the reference** — so the phone number is a `tel:` link and the reference is
 * the largest thing on the card after the product.
 *
 * The controls here are the moves a partner is the right person to make — see
 * `src/server/orders/status.ts` for the whole table:
 *
 * - `BranchDecisionButtons` on a `pending` order, for the branch it was sent
 *   to: confirm it, or decline it with a reason. Only when `canDecide` is
 *   set, which the page derives from the session; a courier looking at the
 *   same order gets the label and no buttons, because whether the branch has
 *   the product is not the courier's to say.
 * - `MarkFulfilledButton` on a `confirmed` order, for whoever is delivering.
 *
 * - On a paid, `confirmed` order the branch also gets "Can't fulfil": the
 *   order is cancelled and MalFleks refunds the customer.
 * - An order the customer has not paid for yet gets no controls at all, and
 *   says so in words: "Not paid yet". That includes a `confirmed` order with
 *   no payment row at all (one confirmed before paying was required).
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "New — waiting on you",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  fulfilled: "Fulfilled",
};

/** What a courier sees: a pending order is waiting on the branch, not on them. */
const COURIER_STATUS_LABEL: Record<string, string> = {
  ...STATUS_LABEL,
  pending: "New — waiting on the branch",
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
  canDecide = false,
  viewer = "branch",
}: {
  order: ListedOrder;
  /** This order's newest `DeliveryPing`, or `null` — only meaningful (and
   *  only fetched by the page) once the order is `"confirmed"`. */
  lastPing?: DeliveryPingView | null;
  /**
   * Whether the person looking is the active partner who owns this order's
   * branch. The page works it out from the session; the Server Actions behind
   * the buttons prove it again from the database, so this only decides what
   * is drawn.
   */
  canDecide?: boolean;
  /** Who is looking: the branch the order was sent to, or the courier carrying it. */
  viewer?: "branch" | "courier";
}) {
  const labels = viewer === "courier" ? COURIER_STATUS_LABEL : STATUS_LABEL;
  // `routeKind` is "brand" (the branch's own fleet) or "agent" (a courier) —
  // see `DeliveryRouteKind` in `src/lib/order.ts`. This used to compare
  // against "branch", which is not a route kind, so a branch delivering its
  // own order was told "Delivery by Toyota own fleet" instead.
  const branchDelivers = order.routeKind === "brand";
  const paid = order.payment?.status === "captured";
  // Since 3 Oct 2026 a customer pays as soon as they order. An order that has
  // a checkout open and no payment yet is waiting on the *customer*: there is
  // nothing for the branch to answer, and nothing to hand over.
  const awaitingPayment = order.status === "pending" && Boolean(order.payment) && !paid;
  // Confirmed but no money held: nothing may be handed over yet. Until 4 Oct
  // 2026 this state still drew "Mark delivered" and the location button.
  const confirmedUnpaid = order.status === "confirmed" && !paid;
  const label =
    awaitingPayment || confirmedUnpaid
      ? "Not paid yet"
      : order.status === "confirmed" && paid
        ? "Paid — deliver now"
        : (labels[order.status] ?? order.status);

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
          {label}
        </span>
      </div>

      {/* Says who has the money, because the wrong guess costs the customer:
          a branch that collects at the door on an order already paid through
          MalFleks has charged them twice. */}
      {order.status !== "cancelled" &&
        (order.payment?.status === "captured" ? (
          <p className="mt-4 rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm">
            <span className="font-medium">Paid through MalFleks.</span> Collect
            nothing at the door — MalFleks pays your share after delivery.
          </p>
        ) : (
          (order.payment || confirmedUnpaid) && (
            <p className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              The customer hasn&apos;t paid yet. There is nothing to do until
              this says “Paid through MalFleks” — don&apos;t hand anything
              over before then.
            </p>
          )
        ))}

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
          {displayPhone(order.customerPhone)}
        </a>
        <p className="text-muted">{order.customerAddress}</p>
      </div>

      <p className="mt-4 text-xs text-muted">
        {branchDelivers && viewer === "branch"
          ? "You are delivering this one yourself."
          : `Delivery by ${order.routeCarrier}${
              order.routeEtaEstimate ? `, ${order.routeEtaEstimate}` : ""
            }.`}
        {order.routeAgentPhone && ` Courier: ${displayPhone(order.routeAgentPhone)}.`}
      </p>

      {/* The branch's answer. Only a pending order has a question to answer. */}
      {order.status === "pending" && canDecide && !awaitingPayment && (
        <BranchDecisionButtons orderId={order.id} reference={order.reference} />
      )}
      {/* Already paid: nothing to confirm, but the branch must be able to say
          it cannot supply the item, which sends the customer a full refund. */}
      {order.status === "confirmed" && paid && canDecide && (
        <BranchDecisionButtons orderId={order.id} reference={order.reference} paid />
      )}

      {order.status === "cancelled" && order.decisionNote && (
        <p className="mt-4 text-xs text-muted">Reason given: {order.decisionNote}</p>
      )}

      {/* Both controls only apply to a confirmed order that has been paid for —
          see `markOrderFulfilledByPartner`, which refuses an unpaid one on the
          server too. `pending`/`cancelled`/`fulfilled` and unpaid orders don't
          get them at all, rather than a disabled version of them. */}
      {order.status === "confirmed" && paid && (
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
