import type { Metadata } from "next";
import Link from "next/link";

import PartnerOrderCard from "@/components/partner/PartnerOrderCard";
import { listOrders } from "@/server/orders/list-orders";
import { latestPingsForOrders } from "@/server/orders/tracking";
import { requirePartner } from "@/server/partners/portal";

export const metadata: Metadata = {
  title: "Orders for your branch",
  robots: { index: false, follow: false },
};

/** Never prerendered, for the reason stated on `/partner`. */
export const dynamic = "force-dynamic";

/**
 * The orders a customer sent to *this* branch.
 *
 * The loop did not close without this. A customer picked a product, filled in
 * their name, phone and address, and got a reference — and the branch that was
 * supposed to fulfil it had no way to find out. Only MalFleks's admin could see the
 * order, which made every sale depend on somebody at MalFleks relaying it by phone.
 *
 * **`branchId` comes from `requirePartner()`, never from the URL.** That is the
 * same boundary the rest of the portal holds: a `branchId` in a query string
 * would hand any partner the name, phone number and home address of every other
 * branch's customers. `listOrders` takes the filter into its WHERE, so the
 * scoping is in the query rather than applied afterwards in JavaScript — which
 * is the version that silently breaks the day someone adds pagination.
 */
export default async function PartnerOrdersPage() {
  const { partner } = await requirePartner("/partner/orders");

  // A brand partner sees orders sent to their branch; a courier sees the jobs
  // a customer routed to them. Both scopes come from the session, never a URL.
  const scope = partner.branchId
    ? { branchId: partner.branchId }
    : partner.agentId
      ? { agentId: partner.agentId }
      : null;

  // The `null` case is load-bearing, not defensive: `listOrders({})` with no
  // filter returns *every* customer's order, for every branch.
  const orders = scope ? await listOrders(scope).catch(() => null) : [];
  const isCourier = partner.kind === "courier";

  // Only a `"confirmed"` order can take a new ping (see `postDeliveryPing`),
  // so that is the only set worth a query for — most of a queue is `pending`
  // and has nothing to show yet.
  const confirmedIds =
    orders?.filter((o) => o.status === "confirmed").map((o) => o.id) ?? [];
  const lastPings = await latestPingsForOrders(confirmedIds).catch(
    () => new Map(),
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Link href="/partner" className="text-sm text-muted hover:text-foreground">
        ← Your listings
      </Link>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-tight">
        Orders for {partner.displayName}
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        {isCourier
          ? "Deliveries a customer routed to you. Call them, and quote the reference. If an order is marked “Paid through MalFleks”, collect nothing at the door — MalFleks has the customer's money and pays your share after delivery. If it isn't, arrange the fee with the branch and the customer directly."
          : "A customer asking to buy from your branch. Call them, and quote the reference. If an order is marked “Paid through MalFleks”, collect nothing at the door — MalFleks has the customer's money and pays your share after delivery. If it isn't, agree the payment with them directly."}
      </p>

      {orders === null ? (
        <div className="glass-card mt-10 rounded-2xl border border-red-600/40 px-6 py-5">
          <h2 className="font-display text-lg font-medium">
            We can&apos;t reach your orders right now
          </h2>
          <p className="mt-2 text-sm text-muted">
            Nothing has been lost — this page could not read them. Try again in
            a moment.
          </p>
        </div>
      ) : !scope ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
          <p className="font-display text-lg font-medium">
            {isCourier
              ? "You aren't in the delivery routing yet"
              : "Your branch isn't on the map yet"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {isCourier
              ? "Customers can only pick a courier that MalFleks has added to the routing, so there is nothing here until we confirm your details and add you."
              : "Customers can only order from a branch that is listed, so there is nothing here until MalFleks confirms your details and puts you on the map."}
          </p>
        </div>
      ) : orders.length === 0 ? (
        <div className="glass-card mt-10 rounded-2xl px-6 py-12 text-center">
          <p className="font-display text-lg font-medium">No orders yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {isCourier
              ? "When a customer picks you to deliver an order, it appears here with their name and number so you can arrange it."
              : "When a customer asks for one of your products, it appears here with their name and number so you can call them."}
          </p>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {orders.map((order) => (
            <PartnerOrderCard
              key={order.id}
              order={order}
              lastPing={lastPings.get(order.id) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
