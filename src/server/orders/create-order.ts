import { Prisma } from "@prisma/client";
import { getPrisma } from "@/server/db/client";
import type { OrderRequest } from "@/lib/order";
import { databaseCatalogueFor } from "./catalogue-source";
import {
  buildOrderRequest,
  type SaveOrderRequestFailure,
  type SaveOrderRequestInput,
} from "./build-order-request";
import { quoteForOrder } from "./quote-order";
import { DEFAULT_DELIVERY_MODE, isDeliveryMode, type DeliveryMode } from "@/lib/fees";

/**
 * Persisting an order request as a real, queryable backend record.
 *
 * Every order request now gets one of these — signed in or anonymous — per
 * the owner's decision recorded in `docs/backend.md`'s third Decision block.
 * MalFleks's own record of an order, in Postgres: an order joins to product, branch,
 * brand and agent, and needs admin/business querying, which is the same
 * relational shape as the catalogue rather than the saved-order-requests
 * exception (`saved-requests.ts`, which stays as-is alongside this — a
 * signed-in customer's own deletable copy is a different, still-valid
 * feature).
 *
 * `buildOrderRequest` does the actual trust-boundary work — re-deriving
 * price, carrier and route from the catalogue so the browser cannot say what
 * it wants to be true. This module's only job is turning that validated
 * result into a durable row.
 */

/**
 * `"quota"` is inherited from `SaveOrderRequestFailure` but unreachable here:
 * it is the saved-request write ceiling (`saved-requests.ts`), and
 * `buildOrderRequest` never produces it. `"persist-failed"` is the one new
 * case — the database itself refused the write, including a reference
 * collision that survived the retry below.
 */
export type CreateOrderFailure = SaveOrderRequestFailure | "persist-failed";

export interface CreatedOrder {
  id: string;
  reference: string;
  status: string;
  createdAt: Date;
}

export type CreateOrderOutcome =
  | { ok: true; value: CreatedOrder }
  | { ok: false; reason: CreateOrderFailure };

/**
 * Writes one order.
 *
 * `customerId` is the Supabase user id from the verified session, or `null` for
 * a signed-out customer — the caller (`src/app/actions/orders.ts`) decides
 * that from the session cookie, never from the payload, same trust boundary
 * as everywhere else in this codebase that touches identity.
 *
 * `reference` is `@unique` in the schema (see the schema comment for the
 * birthday-bound math). A collision is retried exactly once: the retry asks
 * `buildOrderRequest` to regenerate rather than duplicating
 * `generateOrderReference`'s logic here — passing a reference that fails
 * sanitisation makes `createOrderRequest` fall back to its own generator,
 * the same path a tampered client reference already takes.
 */
export async function createOrder(
  input: SaveOrderRequestInput,
  customerId: string | null,
  /** From the verified session, never the form. Used only to email the checkout link and the receipt. */
  customerEmail: string | null = null,
): Promise<CreateOrderOutcome> {
  // Read the catalogue from the database, not from `src/data`. Every product
  // a partner published lives only in Postgres, so the static array would
  // answer `unknown-product` for all of them — see `catalogue-source.ts`.
  const catalogue = await databaseCatalogueFor(input.productId);

  const built = buildOrderRequest(input, undefined, catalogue);
  if (!built.ok) return { ok: false, reason: built.reason };

  try {
    return { ok: true, value: await insertOrder(built.value, customerId, customerEmail) };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      return { ok: false, reason: "persist-failed" };
    }

    // Force a fresh reference the same way a tampered client reference does:
    // an empty string fails `sanitizeReference`, so `createOrderRequest`'s
    // default parameter regenerates one from the brand and branch.
    const retried = buildOrderRequest(
      { ...input, reference: "" },
      undefined,
      catalogue,
    );
    if (!retried.ok) return { ok: false, reason: retried.reason };

    try {
      return { ok: true, value: await insertOrder(retried.value, customerId, customerEmail) };
    } catch {
      // Two collisions in a row against a 614,656-code space is not worth a
      // second retry — something else is wrong, and the customer still has
      // their reference from the browser copy either way.
      return { ok: false, reason: "persist-failed" };
    }
  }
}

async function insertOrder(
  order: OrderRequest,
  customerId: string | null,
  customerEmail: string | null,
): Promise<CreatedOrder> {
  // Computed once, here, and never recomputed later — see the schema comment
  // on `Order`'s quote columns. `null` when the owner hasn't set this city's
  // delivery fee yet (true for every agent route today); the order is still
  // created exactly as it always was, just without a fee snapshot attached.
  const quote = quoteForOrder(order, await deliveryModeForBranch(order.branch.id));

  const row = await getPrisma().order.create({
    data: {
      customerId,
      productId: order.product.id,
      productName: order.product.name,
      unitPriceTZS: order.product.unitPriceTZS,
      brandId: order.brand.id,
      brandName: order.brand.name,
      // `brand.slug` is optional only so `parseOrderRequest` can still read a
      // record written before the field existed; `buildOrderRequest` always
      // goes through `createOrderRequest` with a real `Brand`, which always
      // sets it. The fallback is defensive, not expected to fire.
      brandSlug: order.brand.slug ?? order.brand.id,
      branchId: order.branch.id,
      branchName: order.branch.name,
      branchCity: order.branch.city,
      branchPhone: order.branch.phone ?? null,
      routeKind: order.route.kind,
      routeCarrier: order.route.carrier,
      agentId: order.route.agentId ?? null,
      routeAgentPhone: order.route.agentPhone ?? null,
      routeEtaEstimate: order.route.etaEstimate ?? null,
      customerFullName: order.customer.fullName,
      customerPhone: order.customer.phone,
      customerAddress: order.customer.address,
      customerEmail: customerId ? customerEmail : null,
      quantity: order.quantity,
      lineTotalTZS: order.lineTotalTZS,
      quoteGoodsRungTZS: quote?.goodsRungTZS ?? null,
      quoteDeliveryFeeTZS: quote?.deliveryFeeTZS ?? null,
      quoteDeliveryRungTZS: quote?.deliveryRungTZS ?? null,
      quoteDepositTZS: quote?.depositTZS ?? null,
      quoteDoorPaymentTZS: quote?.doorPaymentTZS ?? null,
      quoteOrderTotalTZS: quote?.orderTotalTZS ?? null,
      quoteCustomerDeliveryTZS: quote?.customerDeliveryTZS ?? null,
      quoteShopDeliveryShareTZS: quote?.shopDeliveryShareTZS ?? null,
      quoteDeliveryMode: quote?.deliveryMode ?? null,
      reference: order.reference,
      requestedAt: new Date(order.requestedAt),
    },
  });

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * What the shop that owns this branch answered about who pays for delivery.
 *
 * Read from the `Partner` row rather than passed in, because the browser must
 * not get a say in it: a client that could name its own delivery mode could
 * name `"shop_delivers"` and get free delivery. Same trust boundary as the fee
 * table itself.
 *
 * A branch with no partner row -- seed catalogue data, or a branch an admin
 * has not wired up -- reads as `DEFAULT_DELIVERY_MODE`, which is how its orders
 * were already priced. A database hiccup here must not stop an order being
 * taken, so a failure falls back to the same default rather than throwing.
 */
async function deliveryModeForBranch(branchId: string): Promise<DeliveryMode> {
  try {
    const partner = await getPrisma().partner.findFirst({
      where: { branchId, kind: "brand", status: "active" },
      select: { deliveryMode: true },
    });
    return isDeliveryMode(partner?.deliveryMode) ? partner.deliveryMode : DEFAULT_DELIVERY_MODE;
  } catch {
    return DEFAULT_DELIVERY_MODE;
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
