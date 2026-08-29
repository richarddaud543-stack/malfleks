import { getBranchById, getBrandById, getProductById } from "@/data";
import {
  createOrderRequest,
  orderBlockReason,
  resolveDeliveryRoute,
  validateOrderRequest,
  type OrderRequest,
} from "@/lib/order";

/**
 * The trust boundary shared by every order-persistence path.
 *
 * Split out of `src/server/orders/saved-requests.ts`, which built this first
 * for the customer's saved copy. `createOrder`
 * (`src/server/orders/create-order.ts`) needs the exact same rebuild, and two
 * copies of a trust boundary is one copy too many.
 *
 * The original reason for the split was narrower — it kept `firebase-admin`
 * out of a path that had nothing to do with Firestore — and that reason is
 * gone with Firebase. The split stays on its own merit: this is the module
 * with the tests, and both persistence paths call it rather than each
 * re-deriving price, carrier and route. `saved-requests.ts` re-exports
 * everything here, so nothing that imported from it has to change.
 */

/**
 * What the browser is allowed to send.
 *
 * Deliberately narrow. The browser sends *which product* and *who the customer
 * is*, never the price, the product name, the carrier or the line total. Those
 * are re-derived here from the catalogue, so a hand-crafted request cannot
 * store a BMW at 5,000 TZS or invent a delivery agent. This is the single most
 * important property of this module.
 */
export interface SaveOrderRequestInput {
  productId: string;
  quantity: string;
  fullName: string;
  phone: string;
  address: string;
  agentId: string | null;
  /** The reference the customer already has on screen, so both copies match. */
  reference: string;
  requestedAt: string;
}

/**
 * `"quota"` belongs to the saved-request write ceiling in
 * `saved-requests.ts` — `buildOrderRequest` itself never returns it, and
 * neither does `createOrder`. It stays part of the union because both
 * callers report through the same `reason` field, and a caller that only
 * ever sees a subset is unremarkable; inventing two near-identical types
 * would be the worse trade.
 */
export type SaveOrderRequestFailure =
  | "unknown-product"
  | "catalogue-mismatch"
  | "not-orderable"
  | "invalid"
  | "quota";

export type BuildResult =
  | { ok: true; value: OrderRequest }
  | { ok: false; reason: SaveOrderRequestFailure };

/**
 * References are read down the phone, so they use a restricted alphabet with
 * no 0/O/1/I/L/S/B/2. Anything not of that shape is a client that has been
 * edited; we replace it rather than reject the order, because the reference is
 * cosmetic and losing the whole request over it would be the wrong trade.
 */
const REFERENCE_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[ACDEFGHJKMNPQRTUVWXY3456789]{4}$/;

export function sanitizeReference(raw: unknown): string | undefined {
  return typeof raw === "string" && REFERENCE_PATTERN.test(raw) ? raw : undefined;
}

/** A day either side of now. Anything else is a clock we should not trust. */
const REQUESTED_AT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function sanitizeRequestedAt(
  raw: unknown,
  nowMs: number = Date.now()
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return undefined;
  if (Math.abs(parsed - nowMs) > REQUESTED_AT_WINDOW_MS) return undefined;
  return new Date(parsed).toISOString();
}

/**
 * Rebuilds the order request server-side from the catalogue.
 *
 * Pure: no database, no session, no clock beyond what is
 * injected. This is where the trust boundary actually is, so it is the part
 * with tests (`saved-requests.test.ts`) — both persistence paths call this
 * one function rather than each re-deriving price, carrier and route.
 */
export function buildOrderRequest(
  input: SaveOrderRequestInput,
  nowMs: number = Date.now()
): BuildResult {
  const product = getProductById(input.productId);
  if (!product) return { ok: false, reason: "unknown-product" };

  const branch = getBranchById(product.branchId);
  const brand = getBrandById(product.brandId);
  // The catalogue asserts these agree at seed time. If they ever do not, this
  // is a corrupt record rather than a bad request, and storing half of it
  // would be worse than storing none.
  if (!branch || !brand) return { ok: false, reason: "catalogue-mismatch" };

  const route = resolveDeliveryRoute(branch);
  if (orderBlockReason(product, route)) {
    return { ok: false, reason: "not-orderable" };
  }

  // The same validator the form runs, run again on the server. The client's
  // copy is a convenience for the customer; this one is the one that counts.
  const validated = validateOrderRequest(
    {
      quantity: input.quantity,
      fullName: input.fullName,
      phone: input.phone,
      address: input.address,
      agentId: input.agentId,
    },
    route
  );
  if (!validated.ok) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    value: createOrderRequest({
      product,
      brand,
      branch,
      order: validated.value,
      reference: sanitizeReference(input.reference),
      requestedAt: sanitizeRequestedAt(input.requestedAt, nowMs),
    }),
  };
}
