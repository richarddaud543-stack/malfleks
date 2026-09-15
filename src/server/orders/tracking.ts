import { getPrisma } from "@/server/db/client";

/**
 * Live-ish delivery tracking: a courier or branch taps "update my location",
 * a customer's map shows the newest tap.
 *
 * ## Why "manual" and not real GPS streaming
 *
 * The owner's scope decision on 2026-09-06, made with the actual state of the
 * fleet in mind: there is no courier mobile app, so there is nothing to hold a
 * background-location permission or stream a continuous trail. `/partner/orders`
 * is a web page opened on whatever phone the courier or branch owner is
 * carrying. A single Geolocation API read, taken at the moment they choose to
 * report it, is the whole budget this version has — and it is enough to answer
 * the question a customer is actually asking ("roughly where is my delivery
 * right now"), not a fleet-management console.
 *
 * ## Ownership, the same shape as everywhere else in this codebase
 *
 * Every function here puts the caller's identity in the `WHERE` clause rather
 * than checking it and then trusting an id — the pattern
 * `deleteOrderRequestForCustomer` and `listOrders`'s `branchId`/`agentId` filter
 * already hold. A `DeliveryPing` has no owner column of its own; it inherits
 * the order's, so every query here starts from "does this order belong to the
 * caller" and only reads or writes pings once that is true. A forged
 * `orderId` belonging to someone else's order matches zero rows and reads as
 * `not-found` — it does not confirm the order exists.
 *
 * ## Why only a `"confirmed"` order accepts a ping
 *
 * `pending` has not been confirmed with the branch yet — there is nothing
 * moving. `cancelled` and `fulfilled` are terminal states from `status.ts`; a
 * ping after either would be reporting the location of a delivery that, as far
 * as MalFleks's own record is concerned, is not happening (any more). Tracking
 * for a `fulfilled` order still *reads* — its last known pings stay visible,
 * the same way order history never disappears — it simply cannot grow a new
 * one.
 */

export interface DeliveryPingView {
  id: string;
  latitude: number;
  longitude: number;
  note: string | null;
  createdAt: string;
}

function serialisePing(row: {
  id: string;
  latitude: number;
  longitude: number;
  note: string | null;
  createdAt: Date;
}): DeliveryPingView {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/** What a tracking view needs from the order itself, alongside its pings. */
export interface TrackedOrderView {
  id: string;
  status: string;
  reference: string;
  productName: string;
  quantity: number;
  branchName: string;
  branchCity: string;
  routeKind: string;
  routeCarrier: string;
  createdAt: string;
  pings: DeliveryPingView[];
}

const TRACKED_ORDER_SELECT = {
  id: true,
  status: true,
  reference: true,
  productName: true,
  quantity: true,
  branchName: true,
  branchCity: true,
  routeKind: true,
  routeCarrier: true,
  createdAt: true,
} as const;

async function pingsFor(orderId: string): Promise<DeliveryPingView[]> {
  const rows = await getPrisma().deliveryPing.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    // A timeline, not an unbounded log — the map only ever shows the newest
    // point, and nobody needs to scroll a courier's whole route history.
    take: 20,
  });
  return rows.map(serialisePing);
}

/**
 * A signed-in customer's own order, by the reference they were given, with its
 * tracking history. `null` if no such order exists **for this customer** —
 * the reference is a short, spoken-aloud code (see the schema comment on
 * `Order.reference`), not a secret, so ownership is what gates this, not the
 * reference's guess-resistance.
 */
export async function trackedOrderForCustomer(
  customerId: string,
  reference: string,
): Promise<TrackedOrderView | null> {
  const order = await getPrisma().order.findFirst({
    where: { reference, customerId },
    select: TRACKED_ORDER_SELECT,
  });
  if (!order) return null;

  const pings = await pingsFor(order.id);
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    pings,
  };
}

/** The scope a signed-in partner may act within — see `partnerForUser`. */
export interface PartnerOrderScope {
  branchId: string | null;
  agentId: string | null;
}

/**
 * The `Order.findFirst` `WHERE` for "does this order belong to this partner",
 * exported so other order-mutating modules share the exact same predicate
 * rather than each writing their own copy of it — `status.ts`'s
 * `markOrderFulfilledByPartner` is the other caller. Three independent copies
 * of "branchId or agentId, derived from the session" is the threshold this
 * codebase has already named once, on `adminSession()`'s own doc comment, as
 * the point past which "fine" stops being true.
 */
export function partnerScopeWhere(orderId: string, scope: PartnerOrderScope) {
  if (scope.branchId) return { id: orderId, branchId: scope.branchId };
  if (scope.agentId) return { id: orderId, agentId: scope.agentId };
  return null;
}

/**
 * One order's tracking history, for the partner fulfilling it.
 *
 * Same scoping `listOrders({ branchId })` / `listOrders({ agentId })` already
 * use on `/partner/orders` — never a bare `orderId` lookup, or any partner who
 * learned an order's id (they appear in URLs nowhere, but an id is not a
 * secret either) could read another branch's delivery history.
 */
export async function trackedOrderForPartner(
  orderId: string,
  scope: PartnerOrderScope,
): Promise<TrackedOrderView | null> {
  const where = partnerScopeWhere(orderId, scope);
  if (!where) return null;

  const order = await getPrisma().order.findFirst({
    where,
    select: TRACKED_ORDER_SELECT,
  });
  if (!order) return null;

  const pings = await pingsFor(order.id);
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    pings,
  };
}

/**
 * The single newest ping for each of several orders, keyed by `orderId` —
 * what `/partner/orders` needs to show "last reported" on a list of cards
 * without one query per card.
 *
 * Deliberately not a `groupBy` (Prisma has no "newest row per group" in one
 * query without raw SQL): one `findMany` ordered newest-first, reduced in
 * JavaScript to the first row seen per `orderId`. Cheap at the volume this
 * table actually has — a courier taps this a handful of times per delivery,
 * not per second — and correct regardless of volume, unlike an `orderBy` a
 * database might not guarantee combined with `distinct` the way this needs.
 */
export async function latestPingsForOrders(
  orderIds: string[],
): Promise<Map<string, DeliveryPingView>> {
  if (orderIds.length === 0) return new Map();

  const rows = await getPrisma().deliveryPing.findMany({
    where: { orderId: { in: orderIds } },
    orderBy: { createdAt: "desc" },
  });

  const latest = new Map<string, DeliveryPingView>();
  for (const row of rows) {
    if (!latest.has(row.orderId)) latest.set(row.orderId, serialisePing(row));
  }
  return latest;
}

export type PostPingFailure =
  | "not-found"
  | "not-trackable"
  | "invalid-location";

export type PostPingOutcome =
  | { ok: true; ping: DeliveryPingView }
  | { ok: false; reason: PostPingFailure };

/**
 * Latitude/longitude is trusted no further than any other browser input:
 * finite, and inside the range coordinates can physically take. There is
 * deliberately no Tanzania bounding-box check — a courier's phone occasionally
 * reporting a position outside it (a bad GPS fix, or a delivery that in
 * reality crosses a border MalFleks does not otherwise model) should not turn
 * into a silently dropped ping. The map only ever draws the point it is given.
 */
function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Records one location report against an order, on behalf of the partner
 * fulfilling it.
 *
 * The write is a plain `create` rather than a guarded `updateMany` like
 * `writeTransition` uses — there is no race to lose here, a ping never
 * overwrites another, it only ever adds one. The one thing that *is* guarded
 * is which order it can attach to: the ownership check and the status check
 * both happen in the same `findFirst` that would have to succeed for the
 * `create` to run at all, so a partner cannot ping an order mid-flight after
 * losing the scope check (branch reassigned, say) between two calls — every
 * call re-checks from the session, exactly like `submitProduct`.
 */
export async function postDeliveryPing(
  orderId: string,
  scope: PartnerOrderScope,
  input: { latitude: number; longitude: number; note?: string | null },
): Promise<PostPingOutcome> {
  if (!isValidCoordinate(input.latitude, input.longitude)) {
    return { ok: false, reason: "invalid-location" };
  }

  const where = partnerScopeWhere(orderId, scope);
  if (!where) return { ok: false, reason: "not-found" };

  const order = await getPrisma().order.findFirst({
    where,
    select: { id: true, status: true },
  });
  if (!order) return { ok: false, reason: "not-found" };
  if (order.status !== "confirmed") {
    return { ok: false, reason: "not-trackable" };
  }

  const note = input.note?.trim();
  const row = await getPrisma().deliveryPing.create({
    data: {
      orderId: order.id,
      latitude: input.latitude,
      longitude: input.longitude,
      note: note ? note : null,
    },
  });

  return { ok: true, ping: serialisePing(row) };
}
