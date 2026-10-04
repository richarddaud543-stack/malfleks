import { getAgentsForCity } from "@/data";
import type {
  Branch,
  Brand,
  DeliveryAgent,
  DeliveryEta,
  Product,
} from "@/data";
import { formatEta, formatTZS } from "./format";
import { MINIMUM_ORDER_VALUE_TZS } from "@/lib/fees";

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
/**
 * Who carries an order from this branch.
 *
 * `agents` is the set of couriers to consider — normally every courier in the
 * database, which the server page has already fetched. **Passing it is not an
 * optimisation.** Until 2026-09-01 this function always read the static
 * `src/data` array, so a courier a real partner had been approved and wired up
 * as simply did not exist as far as routing was concerned: they were never
 * offered to a customer, and a branch that does not run its own vehicles stayed
 * unorderable no matter how many couriers had signed up.
 *
 * The static fallback is kept for the pure unit tests, which exercise the rule
 * itself against fixture couriers and have no database. Every server call site
 * passes the real set.
 */
export function resolveDeliveryRoute(
  branch: Branch,
  agents?: DeliveryAgent[]
): DeliveryRoute {
  if (branch.deliveryOffered) return { kind: "brand", agents: [] };

  const candidates = agents
    ? // Same rule as `getAgentsForCity` in both `@/data` and the repositories:
      // the courier's own city, or a region they have said they serve.
      agents.filter(
        (a) => a.city === branch.city || a.regionsServed.includes(branch.city)
      )
    : getAgentsForCity(branch.city);

  return { kind: "agent", agents: candidates };
}

export function deliveryRouteLabel(kind: DeliveryRouteKind): string {
  return kind === "brand" ? "Brand delivery" : "Local agent delivery";
}

/**
 * The soonest a courier in this set could arrive, or `null` for an empty set.
 *
 * Ranked on the *upper* bound first, because that is the figure a customer is
 * actually promised — a "1–2 days" courier is slower than a "next day" one
 * even though both could turn up tomorrow. The lower bound only breaks ties.
 */
export function fastestAgent(agents: DeliveryAgent[]): DeliveryAgent | null {
  return agents.reduce<DeliveryAgent | null>((best, agent) => {
    if (!best) return agent;
    if (agent.eta.maxDays !== best.eta.maxDays) {
      return agent.eta.maxDays < best.eta.maxDays ? agent : best;
    }
    return agent.eta.minDays < best.eta.minDays ? agent : best;
  }, null);
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
// The route, answered before the customer commits to it
// ---------------------------------------------------------------------------

/**
 * Everything the routing rule can say about a product *while it is still being
 * browsed* — who would carry it, how soon, and whether it can be ordered at
 * all. Built from `resolveDeliveryRoute` rather than beside it, so a search
 * card and the delivery page can never disagree about the answer.
 */
export interface DeliveryOutlook {
  kind: DeliveryRouteKind;
  /**
   * Who carries it: the brand's own fleet, or the fastest courier serving the
   * city. `null` only when an agent route has nobody to offer, which is the
   * one case where there is genuinely no carrier to name — `unavailable` is
   * always set alongside it, so nothing has to render a blank.
   */
  carrier: string | null;
  /** How many couriers the customer will get to choose between. `0` on a brand route. */
  choiceCount: number;
  /**
   * Soonest published arrival, or `null` when nobody publishes one. Brand
   * fleets are always `null`: no branch record carries a delivery time, and
   * inventing a plausible one is exactly what the `verified` flag exists to
   * prevent. The UI says less rather than guessing.
   */
  eta: DeliveryEta | null;
  /**
   * Why this cannot be ordered right now, short enough to sit on a card, or
   * `null`. `orderBlockReason` stays the full-sentence version for the
   * delivery page — same condition, two lengths.
   */
  unavailable: string | null;
}

export function previewDelivery({
  product,
  brand,
  branch,
  agents,
}: {
  product: Product;
  brand: Brand;
  branch: Branch;
  /** See `resolveDeliveryRoute` — omit only where there is no database. */
  agents?: DeliveryAgent[];
}): DeliveryOutlook {
  const route = resolveDeliveryRoute(branch, agents);
  const fastest = fastestAgent(route.agents);

  const unavailable = !product.inStock
    ? "Out of stock"
    : route.kind === "agent" && route.agents.length === 0
      ? `No courier serves ${branch.city}`
      : null;

  return {
    kind: route.kind,
    carrier:
      route.kind === "brand" ? brandCarrierName(brand) : (fastest?.name ?? null),
    choiceCount: route.agents.length,
    eta: fastest?.eta ?? null,
    unavailable,
  };
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

/**
 * Any stored number, grouped for reading when it is a Tanzanian mobile and
 * left exactly as stored when it is not. `formatPhone` only understands the
 * canonical form; branch and courier numbers arrive however a partner typed
 * them, and until 4 Oct 2026 they were printed that way ("+255629264383").
 */
export function displayPhone(raw: string): string {
  const normalized = normalizePhone(raw);
  return normalized ? formatPhone(normalized) : raw;
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
  /**
   * The city the order is going to, as the customer picked it: the branch's
   * own city, or `OTHER_DELIVERY_CITY`. See `validateOrderRequest` for why it
   * is asked at all. Optional so a caller written before 4 Oct 2026 (and a
   * draft saved by an older tab) still type-checks; a missing value is
   * treated as "not answered" wherever the branch's city is known.
   */
  deliveryCity?: string;
}

/** What the form sends when the customer says they are somewhere else. */
export const OTHER_DELIVERY_CITY = "elsewhere";

export const emptyOrderInput: OrderRequestInput = {
  quantity: "1",
  fullName: "",
  phone: "",
  address: "",
  agentId: null,
  deliveryCity: "",
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

/**
 * `deliveryCity` is the city the branch delivers in — its own. Pass it and the
 * customer has to say their address is there.
 *
 * Why it is asked (4 Oct 2026): every delivery on MalFleks is priced and
 * carried within the branch's city — `quoteForOrder` quotes on `branch.city`
 * and a courier is offered because they serve it. Nothing checked the address,
 * so an order for a Dodoma shop with the address "Kigoma" was accepted and
 * could be paid for. The address is free text and cannot be parsed reliably,
 * so the customer is asked the one question that matters and the order is
 * refused when the answer is "somewhere else".
 *
 * Optional only for the pure tests of the other rules. The form and the
 * server (`buildOrderRequest`) both pass it.
 */
export function validateOrderRequest(
  input: OrderRequestInput,
  route: DeliveryRoute,
  unitPriceTZS: number,
  deliveryCity?: string
): OrderValidation {
  const errors: OrderErrors = {};

  if (deliveryCity !== undefined) {
    const chosen = (input.deliveryCity ?? "").trim();
    if (chosen === "") {
      errors.deliveryCity = "Say which city this is going to.";
    } else if (chosen !== deliveryCity) {
      errors.deliveryCity = `This shop only delivers within ${deliveryCity}.`;
    }
  }

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
  } else if (
    MINIMUM_ORDER_VALUE_TZS !== null &&
    rawQuantity * unitPriceTZS < MINIMUM_ORDER_VALUE_TZS
  ) {
    // A whole-order rule, not really about the quantity field — but it's the
    // one thing the customer can change to fix it, and reusing `quantity`
    // avoids inventing a new error slot `OrderErrors`/the form don't have.
    errors.quantity = `MalFleks orders start at ${formatTZS(MINIMUM_ORDER_VALUE_TZS)}. Add more to reach the minimum.`;
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
  /** `slug` is what the branch page is addressed by. Optional so a request
   *  written by an earlier build still parses out of localStorage — readers
   *  fall back to `id`, which every seed brand currently matches. */
  brand: { id: string; name: string; slug?: string };
  /** Phone is optional in the branch data, and several branches have none —
   *  15 of 19 today. Anything telling the customer to ring the branch has to
   *  handle its absence; see OrderConfirmation's step 2. */
  branch: { id: string; name: string; city: string; phone?: string };
  route: OrderRouteRecord;
  customer: { fullName: string; phone: string; address: string };
  /**
   * Set on the browser's copy once the request has also been written to a
   * signed-in customer's account, so the confirmation screen can say whether
   * this reference will outlive the tab. Absent for every signed-out request,
   * which is all of them until someone signs in. Never sent to the server —
   * the server decides what it stored.
   */
  savedToAccount?: boolean;
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
        // The record keeps the *rendered* label, not the day counts: it is a
        // receipt of what the customer was told at the time, and it has to
        // still read correctly if `formatEta`'s wording ever changes.
        etaEstimate: formatEta(order.agent.eta),
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
    brand: { id: brand.id, name: brand.name, slug: brand.slug },
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

export const ORDER_STORAGE_KEY = "malfleks:order-request";

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
