import { getAgentsForCity } from "@/data";
import type { Branch, Brand, DeliveryAgent, Product } from "@/data";

/**
 * Order request logic.
 *
 * Everything a customer's order depends on — the delivery route, the line
 * total, the reference, and every field rule — lives here so the components
 * only render. There is no backend in this phase: an order request is built
 * client-side, handed to `sessionStorage` to survive the hop to the
 * confirmation screen, and never sent anywhere.
 */

// ---------------------------------------------------------------------------
// Delivery routing
// ---------------------------------------------------------------------------

/** `brand` = the branch's own fleet; `agent` = a local third-party courier. */
export type DeliveryRouteKind = "brand" | "agent";

export interface DeliveryRoute {
  kind: DeliveryRouteKind;
  /**
   * Agents the customer may pick from. Always empty on a brand route — when
   * the branch delivers, no third party is involved at all.
   */
  agents: DeliveryAgent[];
}

/**
 * The marketplace's core rule, in one place: a branch that runs its own fleet
 * delivers the order itself, otherwise the customer is connected to a local
 * agent serving that branch's city.
 */
export function resolveDeliveryRoute(branch: Branch): DeliveryRoute {
  return branch.deliveryOffered
    ? { kind: "brand", agents: [] }
    : { kind: "agent", agents: getAgentsForCity(branch.city) };
}

export function deliveryRouteLabel(kind: DeliveryRouteKind): string {
  return kind === "brand" ? "Brand delivery" : "Local agent delivery";
}

/**
 * Who carries a brand-routed order. The branch is already named separately on
 * every summary, so this says what the brand does rather than repeating it.
 */
export function brandCarrierName(brand: Brand): string {
  return `${brand.name} own fleet`;
}

/**
 * Why this product cannot be requested right now, or `null` if it can.
 * An unroutable order is as blocking as an unavailable one: if nobody serves
 * the branch's city there is no honest way to promise a delivery.
 */
export function orderBlockReason(
  product: Product,
  route: DeliveryRoute
): string | null {
  if (!product.inStock) {
    return "This product is out of stock at its branch, so it can't be requested yet.";
  }

  if (route.kind === "agent" && route.agents.length === 0) {
    return "No delivery agent currently serves this branch's city, so this order can't be routed.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/** Above this, a customer is really placing a trade order — send them to the branch. */
export const MAX_QUANTITY = 99;

export function calculateLineTotal(
  unitPriceTZS: number,
  quantity: number
): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity must be a positive integer, got ${quantity}`);
  }
  return unitPriceTZS * quantity;
}

/** The quantity a raw input field stands for, or `null` if it is not usable. */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const value = Number(text);
  const usable =
    Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY;
  return usable ? value : null;
}

/**
 * Line total for a summary that updates as the customer types. `null` while
 * the quantity is mid-edit, so the summary can show a placeholder rather than
 * a wrong or crashing total.
 */
export function previewLineTotal(
  unitPriceTZS: number,
  rawQuantity: string
): number | null {
  const quantity = parseQuantity(rawQuantity);
  return quantity === null ? null : calculateLineTotal(unitPriceTZS, quantity);
}

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

/**
 * Tanzanian mobile numbers are nine significant digits starting with 6 or 7
 * (Vodacom 074–076, Airtel 068/078, Tigo 065/067/071, Halotel 061/062,
 * TTCL 073, Zantel 077). Landlines (2…) are deliberately rejected: a courier
 * needs to reach the customer on the road.
 */
const TZ_MOBILE = /^(?:\+?255|0)([67]\d{8})$/;

/** Canonical `+255XXXXXXXXX`, or `null` if the input is not a TZ mobile number. */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s()\-.]/g, "");
  const match = TZ_MOBILE.exec(compact);
  return match ? `+255${match[1]}` : null;
}

/** Groups a normalized number for display: `+255 754 123 456`. */
export function formatPhone(normalized: string): string {
  const match = /^\+255(\d{3})(\d{3})(\d{3})$/.exec(normalized);
  return match ? `+255 ${match[1]} ${match[2]} ${match[3]}` : normalized;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Raw form state. Everything is a string because that is what inputs give us. */
export interface OrderRequestInput {
  quantity: string;
  fullName: string;
  phone: string;
  address: string;
  /** Stays `null` on a brand route, where there is nothing to choose. */
  agentId: string | null;
}

export const emptyOrderInput: OrderRequestInput = {
  quantity: "1",
  fullName: "",
  phone: "",
  address: "",
  agentId: null,
};

export type OrderField = keyof OrderRequestInput;

export type OrderErrors = Partial<Record<OrderField, string>>;

/** A cleaned-up order request, ready to be turned into a record. */
export interface ValidatedOrder {
  quantity: number;
  fullName: string;
  /** Normalized to `+255XXXXXXXXX`. */
  phone: string;
  address: string;
  /** The chosen courier, or `null` when the brand delivers. */
  agent: DeliveryAgent | null;
}

export type OrderValidation =
  | { ok: true; value: ValidatedOrder }
  | { ok: false; errors: OrderErrors };

const MIN_NAME_LENGTH = 2;
const MIN_ADDRESS_LENGTH = 6;

export function validateOrderRequest(
  input: OrderRequestInput,
  route: DeliveryRoute
): OrderValidation {
  const errors: OrderErrors = {};

  const quantityText = input.quantity.trim();
  const rawQuantity = Number(quantityText);
  if (quantityText === "") {
    errors.quantity = "Enter how many you want.";
  } else if (!Number.isInteger(rawQuantity)) {
    errors.quantity = "Quantity must be a whole number.";
  } else if (rawQuantity < 1) {
    errors.quantity = "Quantity must be at least 1.";
  } else if (rawQuantity > MAX_QUANTITY) {
    errors.quantity = `For more than ${MAX_QUANTITY} units, contact the branch directly.`;
  }
  const quantity = parseQuantity(input.quantity);

  const fullName = input.fullName.trim();
  if (fullName.length < MIN_NAME_LENGTH) {
    errors.fullName = "Enter the name the driver should ask for.";
  }

  const phone = normalizePhone(input.phone);
  if (input.phone.trim() === "") {
    errors.phone = "Enter a phone number we can reach you on.";
  } else if (!phone) {
    errors.phone = "Enter a Tanzanian mobile number, e.g. 0754 123 456.";
  }

  const address = input.address.trim();
  if (address.length < MIN_ADDRESS_LENGTH) {
    errors.address = "Enter a street and area so the driver can find you.";
  }

  // A brand route has nothing to pick, so a stray agentId is simply dropped
  // rather than treated as an error.
  let agent: DeliveryAgent | null = null;
  if (route.kind === "agent") {
    agent = route.agents.find((a) => a.id === input.agentId) ?? null;
    if (!agent) {
      errors.agentId = "Select an agent to carry this order.";
    }
  }

  // The `!phone`/`quantity === null` halves are unreachable once `errors` is
  // empty; they are here so the success branch narrows without a cast.
  if (Object.keys(errors).length > 0 || !phone || quantity === null) {
    return { ok: false, errors };
  }

  return { ok: true, value: { quantity, fullName, phone, address, agent } };
}

// ---------------------------------------------------------------------------
// Order reference
// ---------------------------------------------------------------------------

/**
 * No 0/O/1/I/L/S/B/2 — references get read down the phone to a branch, and
 * ambiguous glyphs are the whole reason support calls go wrong.
 */
const REFERENCE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY3456789";

export const ORDER_REFERENCE_CODE_LENGTH = 4;

/** Three-letter code for a brand or city name, padded if the name is short. */
function segment(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 3).padEnd(3, "X");
}

/**
 * A reference a customer can read aloud: brand, city, then a short code —
 * `TOY-DAR-K7M4`. It is generated locally and means nothing to any system;
 * it exists so the customer and the branch can talk about the same request.
 */
export function generateOrderReference(
  brand: Brand,
  branch: Branch,
  random: () => number = Math.random
): string {
  let code = "";
  for (let i = 0; i < ORDER_REFERENCE_CODE_LENGTH; i += 1) {
    // Clamp: a random source returning exactly 1 would index past the end.
    const index = Math.min(
      REFERENCE_ALPHABET.length - 1,
      Math.floor(random() * REFERENCE_ALPHABET.length)
    );
    code += REFERENCE_ALPHABET[index];
  }
  return `${segment(brand.name)}-${segment(branch.city)}-${code}`;
}

// ---------------------------------------------------------------------------
// The order request record
// ---------------------------------------------------------------------------

export interface OrderRouteRecord {
  kind: DeliveryRouteKind;
  /** Who actually carries it — the brand itself, or the chosen agent. */
  carrier: string;
  agentId?: string;
  agentPhone?: string;
  etaEstimate?: string;
}

export interface OrderRequest {
  reference: string;
  /** When the customer submitted. Nothing is stored server-side. */
  requestedAt: string;
  product: { id: string; name: string; unitPriceTZS: number };
  quantity: number;
  lineTotalTZS: number;
  brand: { id: string; name: string };
  /** Phone is optional in the branch data, and several branches have none. */
  branch: { id: string; name: string; city: string; phone?: string };
  route: OrderRouteRecord;
  customer: { fullName: string; phone: string; address: string };
}

export interface OrderRequestSeed {
  product: Product;
  brand: Brand;
  branch: Branch;
  order: ValidatedOrder;
  /** Injectable so tests (and only tests) get a fixed reference. */
  reference?: string;
  requestedAt?: string;
}

export function createOrderRequest({
  product,
  brand,
  branch,
  order,
  reference = generateOrderReference(brand, branch),
  requestedAt = new Date().toISOString(),
}: OrderRequestSeed): OrderRequest {
  const route: OrderRouteRecord = order.agent
    ? {
        kind: "agent",
        carrier: order.agent.name,
        agentId: order.agent.id,
        agentPhone: order.agent.phone,
        etaEstimate: order.agent.etaEstimate,
      }
    : { kind: "brand", carrier: brandCarrierName(brand) };

  return {
    reference,
    requestedAt,
    product: {
      id: product.id,
      name: product.name,
      unitPriceTZS: product.priceTZS,
    },
    quantity: order.quantity,
    lineTotalTZS: calculateLineTotal(product.priceTZS, order.quantity),
    brand: { id: brand.id, name: brand.name },
    branch: {
      id: branch.id,
      name: branch.name,
      city: branch.city,
      ...(branch.phone ? { phone: branch.phone } : {}),
    },
    route,
    customer: {
      fullName: order.fullName,
      phone: order.phone,
      address: order.address,
    },
  };
}

// ---------------------------------------------------------------------------
// Hand-off between the two steps
// ---------------------------------------------------------------------------

export const ORDER_STORAGE_KEY = "soko:order-request";

export function serializeOrderRequest(order: OrderRequest): string {
  return JSON.stringify(order);
}

/**
 * Reads a request back out of storage. Anything malformed — a stale key from
 * an older build, a half-written value, a hand-edited one — comes back `null`
 * so the confirmation screen can say so instead of rendering blanks.
 */
export function parseOrderRequest(raw: string | null): OrderRequest | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const value = parsed as Partial<OrderRequest>;

  const hasStrings =
    typeof value.reference === "string" &&
    typeof value.requestedAt === "string" &&
    typeof value.lineTotalTZS === "number" &&
    typeof value.quantity === "number";

  const hasParties =
    !!value.product &&
    typeof value.product.name === "string" &&
    typeof value.product.unitPriceTZS === "number" &&
    !!value.brand &&
    typeof value.brand.name === "string" &&
    !!value.branch &&
    typeof value.branch.name === "string" &&
    !!value.customer &&
    typeof value.customer.fullName === "string";

  const hasRoute =
    !!value.route &&
    (value.route.kind === "brand" || value.route.kind === "agent") &&
    typeof value.route.carrier === "string";

  return hasStrings && hasParties && hasRoute ? (value as OrderRequest) : null;
}
