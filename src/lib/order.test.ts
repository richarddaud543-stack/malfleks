import { describe, it, expect } from "vitest";
import { getBranchById, getBrandById, getProductById } from "@/data";
import type { Branch, Brand, DeliveryAgent, Product } from "@/data";
import {
  MAX_QUANTITY,
  ORDER_STORAGE_KEY,
  calculateLineTotal,
  createOrderRequest,
  deliveryRouteLabel,
  emptyOrderInput,
  fastestAgent,
  formatPhone,
  generateOrderReference,
  normalizePhone,
  orderBlockReason,
  parseOrderRequest,
  parseQuantity,
  previewDelivery,
  previewLineTotal,
  resolveDeliveryRoute,
  serializeOrderRequest,
  validateOrderRequest,
  type DeliveryRoute,
  type OrderRequest,
  type OrderRequestInput,
  type ValidatedOrder,
} from "./order";
import { formatEta } from "./format";

function brand(id: string): Brand {
  const found = getBrandById(id);
  if (!found) throw new Error(`no brand ${id}`);
  return found;
}

function branch(id: string): Branch {
  const found = getBranchById(id);
  if (!found) throw new Error(`no branch ${id}`);
  return found;
}

function product(id: string): Product {
  const found = getProductById(id);
  if (!found) throw new Error(`no product ${id}`);
  return found;
}

/** Deterministic stand-in for Math.random, cycling through fixed draws. */
function fixedRandom(...draws: number[]): () => number {
  let i = 0;
  return () => draws[i++ % draws.length];
}

// toyota-dar runs its own fleet; toyota-arusha does not and sits in Arusha,
// which two agents serve. Both come straight from the seed data.
const brandRoute = resolveDeliveryRoute(branch("toyota-dar"));
const agentRoute = resolveDeliveryRoute(branch("toyota-arusha"));

function input(patch: Partial<OrderRequestInput> = {}): OrderRequestInput {
  return {
    ...emptyOrderInput,
    fullName: "Neema Mushi",
    phone: "0754 123 456",
    address: "12 Sokoine Road, Arusha",
    ...patch,
  };
}

describe("resolveDeliveryRoute", () => {
  it("routes to the brand's own fleet when the branch delivers", () => {
    expect(brandRoute.kind).toBe("brand");
    // Nothing to choose: no third party is involved at all.
    expect(brandRoute.agents).toEqual([]);
  });

  it("offers the agents serving the branch's city when it does not", () => {
    expect(agentRoute.kind).toBe("agent");
    const names = agentRoute.agents.map((a) => a.name);
    expect(names).toContain("Arusha Swift Couriers");
    // Fargo is based in Dar but lists Arusha in regionsServed.
    expect(names).toContain("Fargo Courier");
    expect(names).not.toContain("Mwanza Express Riders");
  });

  it("returns an empty agent list for a city nobody serves", () => {
    const unserved: Branch = { ...branch("toyota-arusha"), city: "Tanga" };
    const route = resolveDeliveryRoute(unserved);
    expect(route.kind).toBe("agent");
    expect(route.agents).toEqual([]);
  });
});

describe("deliveryRouteLabel", () => {
  it("names each route the way the rest of the site does", () => {
    expect(deliveryRouteLabel("brand")).toBe("Brand delivery");
    expect(deliveryRouteLabel("agent")).toBe("Local agent delivery");
  });
});

describe("orderBlockReason", () => {
  it("allows an in-stock, routable product", () => {
    expect(orderBlockReason(product("toyota-corolla"), brandRoute)).toBeNull();
    expect(orderBlockReason(product("toyota-hilux"), agentRoute)).toBeNull();
  });

  it("blocks an out-of-stock product", () => {
    // ford-everest is flagged out of stock in the seed data.
    const reason = orderBlockReason(product("ford-everest"), agentRoute);
    expect(reason).toMatch(/out of stock/i);
  });

  it("blocks a product no agent can carry", () => {
    const unroutable: DeliveryRoute = { kind: "agent", agents: [] };
    const reason = orderBlockReason(product("toyota-hilux"), unroutable);
    expect(reason).toMatch(/no delivery agent/i);
  });

  it("reports stock before routing when both are wrong", () => {
    const unroutable: DeliveryRoute = { kind: "agent", agents: [] };
    expect(orderBlockReason(product("ford-everest"), unroutable)).toMatch(
      /out of stock/i
    );
  });
});

describe("fastestAgent", () => {
  function agentWith(eta: { minDays: number; maxDays: number }, name: string) {
    return {
      id: name,
      name,
      city: "Arusha",
      regionsServed: ["Arusha"],
      phone: "+255 68 000 0000",
      eta,
      verified: false,
    } satisfies DeliveryAgent;
  }

  it("has nothing to offer for an empty list", () => {
    expect(fastestAgent([])).toBeNull();
  });

  it("ranks on the promised upper bound, not the best case", () => {
    // A courier that *might* arrive today but may take three days is slower
    // than one that commits to tomorrow — the customer is promised the max.
    const optimistic = agentWith({ minDays: 0, maxDays: 3 }, "Optimistic");
    const dependable = agentWith({ minDays: 1, maxDays: 1 }, "Dependable");
    expect(fastestAgent([optimistic, dependable])?.name).toBe("Dependable");
  });

  it("breaks a tie on the upper bound with the lower one", () => {
    const wide = agentWith({ minDays: 0, maxDays: 2 }, "Wide");
    const narrow = agentWith({ minDays: 2, maxDays: 2 }, "Narrow");
    expect(fastestAgent([wide, narrow])?.name).toBe("Wide");
  });

  it("picks the same-day courier out of the two serving Dar es Salaam", () => {
    // Elite Digital is a Dar branch that does *not* run its own fleet, so it
    // routes to the two couriers covering the city — Bolt Send (same-day) and
    // Fargo Courier (1–2 days).
    const dar = resolveDeliveryRoute(branch("apple-elite-dar"));
    expect(dar.agents.length).toBeGreaterThan(1);
    expect(fastestAgent(dar.agents)?.name).toBe("Bolt Send");
  });
});

describe("previewDelivery", () => {
  it("names the brand's own fleet, and promises no time it cannot know", () => {
    const outlook = previewDelivery({
      product: product("toyota-corolla"),
      brand: brand("toyota"),
      branch: branch("toyota-dar"),
    });

    expect(outlook.kind).toBe("brand");
    expect(outlook.carrier).toBe("Toyota own fleet");
    expect(outlook.choiceCount).toBe(0);
    // No branch record carries a delivery time, so there is none to show.
    expect(outlook.eta).toBeNull();
    expect(outlook.unavailable).toBeNull();
  });

  it("gives the soonest courier and how many there are to choose from", () => {
    const outlook = previewDelivery({
      product: product("toyota-hilux"),
      brand: brand("toyota"),
      branch: branch("toyota-arusha"),
    });

    expect(outlook.kind).toBe("agent");
    expect(outlook.carrier).toBe("Arusha Swift Couriers");
    expect(outlook.choiceCount).toBe(2);
    expect(outlook.eta).toEqual({ minDays: 0, maxDays: 0 });
  });

  it("agrees with the delivery page's own rule about what is blocked", () => {
    // ford-everest is flagged out of stock in the seed data.
    const seed = {
      product: product("ford-everest"),
      brand: brand("ford"),
      branch: branch("ford-arusha"),
    };
    const outlook = previewDelivery(seed);

    expect(outlook.unavailable).toBe("Out of stock");
    // Same condition, two lengths — a card cannot fit the long sentence, but
    // the two must never disagree about *whether* it is blocked.
    expect(
      orderBlockReason(seed.product, resolveDeliveryRoute(seed.branch))
    ).not.toBeNull();
  });

  it("says who is missing when no courier serves the city", () => {
    const outlook = previewDelivery({
      product: product("toyota-hilux"),
      brand: brand("toyota"),
      branch: { ...branch("toyota-arusha"), city: "Tanga" },
    });

    expect(outlook.unavailable).toBe("No courier serves Tanga");
    // Nobody to name, and the caller is told so rather than handed a blank.
    expect(outlook.carrier).toBeNull();
    expect(outlook.eta).toBeNull();
  });

  it("reports stock before routing when both are wrong", () => {
    const outlook = previewDelivery({
      product: product("ford-everest"),
      brand: brand("ford"),
      branch: { ...branch("ford-arusha"), city: "Tanga" },
    });

    expect(outlook.unavailable).toBe("Out of stock");
  });
});

describe("calculateLineTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(calculateLineTotal(68_000_000, 3)).toBe(204_000_000);
    expect(calculateLineTotal(32_000, 1)).toBe(32_000);
  });

  it("refuses quantities that are not whole and positive", () => {
    expect(() => calculateLineTotal(1000, 0)).toThrow(RangeError);
    expect(() => calculateLineTotal(1000, -2)).toThrow(RangeError);
    expect(() => calculateLineTotal(1000, 1.5)).toThrow(RangeError);
    expect(() => calculateLineTotal(1000, NaN)).toThrow(RangeError);
  });
});

describe("parseQuantity", () => {
  it("reads the whole numbers a customer can actually order", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity(" 12 ")).toBe(12);
    expect(parseQuantity(String(MAX_QUANTITY))).toBe(MAX_QUANTITY);
  });

  it("returns null for anything not orderable", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("   ")).toBeNull();
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(parseQuantity("2.5")).toBeNull();
    expect(parseQuantity("two")).toBeNull();
    expect(parseQuantity(String(MAX_QUANTITY + 1))).toBeNull();
  });
});

describe("previewLineTotal", () => {
  it("multiplies out a usable quantity", () => {
    expect(previewLineTotal(68_000_000, "2")).toBe(136_000_000);
  });

  it("holds off while the field is mid-edit rather than showing a wrong total", () => {
    expect(previewLineTotal(68_000_000, "")).toBeNull();
    expect(previewLineTotal(68_000_000, "0")).toBeNull();
    expect(previewLineTotal(68_000_000, "abc")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("accepts the three ways Tanzanians write a mobile number", () => {
    expect(normalizePhone("0754123456")).toBe("+255754123456");
    expect(normalizePhone("+255754123456")).toBe("+255754123456");
    expect(normalizePhone("255754123456")).toBe("+255754123456");
  });

  it("ignores spacing and punctuation", () => {
    expect(normalizePhone("+255 754 123 456")).toBe("+255754123456");
    expect(normalizePhone("0754-123-456")).toBe("+255754123456");
    expect(normalizePhone(" (0754) 123.456 ")).toBe("+255754123456");
  });

  it("accepts every live mobile prefix range", () => {
    expect(normalizePhone("0612345678")).toBe("+255612345678"); // Halotel
    expect(normalizePhone("0682345678")).toBe("+255682345678"); // Airtel
    expect(normalizePhone("0712345678")).toBe("+255712345678"); // Tigo
    expect(normalizePhone("0772345678")).toBe("+255772345678"); // Zantel
  });

  it("rejects landlines, wrong lengths and non-numbers", () => {
    expect(normalizePhone("+255 22 286 0000")).toBeNull(); // Dar landline
    expect(normalizePhone("0854123456")).toBeNull(); // no 8-series mobiles
    expect(normalizePhone("075412345")).toBeNull(); // one digit short
    expect(normalizePhone("07541234567")).toBeNull(); // one digit long
    expect(normalizePhone("+2550754123456")).toBeNull(); // trunk 0 kept by mistake
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("groups a normalized number for reading aloud", () => {
    expect(formatPhone("+255754123456")).toBe("+255 754 123 456");
  });

  it("leaves anything it does not recognise alone", () => {
    expect(formatPhone("+44 20 7946 0000")).toBe("+44 20 7946 0000");
  });
});

describe("validateOrderRequest", () => {
  it("accepts a complete brand-delivered request", () => {
    const result = validateOrderRequest(input({ quantity: "2" }), brandRoute);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.quantity).toBe(2);
    expect(result.value.phone).toBe("+255754123456");
    // Nothing to pick on a brand route.
    expect(result.value.agent).toBeNull();
  });

  it("trims the free-text fields it keeps", () => {
    const result = validateOrderRequest(
      input({ fullName: "  Neema Mushi  ", address: "  Sokoine Road  " }),
      brandRoute
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fullName).toBe("Neema Mushi");
    expect(result.value.address).toBe("Sokoine Road");
  });

  it("requires an agent on an agent route and resolves the chosen one", () => {
    const missing = validateOrderRequest(input(), agentRoute);
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors.agentId).toMatch(/select an agent/i);

    const chosen = validateOrderRequest(
      input({ agentId: "arusha-swift-couriers" }),
      agentRoute
    );
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.value.agent?.name).toBe("Arusha Swift Couriers");
  });

  it("rejects an agent that does not serve this branch's city", () => {
    const result = validateOrderRequest(
      input({ agentId: "mwanza-express-riders" }),
      agentRoute
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.agentId).toBeDefined();
  });

  it("drops a stray agent choice on a brand route instead of failing", () => {
    const result = validateOrderRequest(
      input({ agentId: "fargo-courier" }),
      brandRoute
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.agent).toBeNull();
  });

  it("explains each way a quantity can be wrong", () => {
    const errorFor = (quantity: string) => {
      const result = validateOrderRequest(input({ quantity }), brandRoute);
      return result.ok ? undefined : result.errors.quantity;
    };

    expect(errorFor("")).toMatch(/how many/i);
    expect(errorFor("abc")).toMatch(/whole number/i);
    expect(errorFor("1.5")).toMatch(/whole number/i);
    expect(errorFor("0")).toMatch(/at least 1/i);
    expect(errorFor("-3")).toMatch(/at least 1/i);
    expect(errorFor(String(MAX_QUANTITY + 1))).toMatch(/contact the branch/i);
    expect(errorFor(String(MAX_QUANTITY))).toBeUndefined();
  });

  it("distinguishes a missing phone from an implausible one", () => {
    const blank = validateOrderRequest(input({ phone: "  " }), brandRoute);
    const wrong = validateOrderRequest(input({ phone: "12345" }), brandRoute);
    expect(blank.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (blank.ok || wrong.ok) return;
    expect(blank.errors.phone).toMatch(/enter a phone number/i);
    expect(wrong.errors.phone).toMatch(/tanzanian mobile/i);
  });

  it("requires a real name and a findable address", () => {
    const result = validateOrderRequest(
      input({ fullName: "N", address: "12" }),
      brandRoute
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.fullName).toBeDefined();
    expect(result.errors.address).toBeDefined();
  });

  it("reports every broken field at once, not just the first", () => {
    const result = validateOrderRequest(
      { quantity: "0", fullName: "", phone: "", address: "", agentId: null },
      agentRoute
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "address",
      "agentId",
      "fullName",
      "phone",
      "quantity",
    ]);
  });
});

describe("generateOrderReference", () => {
  it("reads as brand, city, then a short code", () => {
    const reference = generateOrderReference(
      brand("toyota"),
      branch("toyota-dar"),
      fixedRandom(0)
    );
    // "Dar es Salaam" collapses to its first three letters.
    expect(reference).toBe("TOY-DAR-AAAA");
  });

  it("varies the code with the random source", () => {
    const a = generateOrderReference(
      brand("bmw"),
      branch("bmw-arusha"),
      fixedRandom(0.1, 0.5, 0.9, 0.3)
    );
    const b = generateOrderReference(
      brand("bmw"),
      branch("bmw-arusha"),
      fixedRandom(0.9, 0.2, 0.4, 0.6)
    );
    expect(a).toMatch(/^BMW-ARU-[A-Z0-9]{4}$/);
    expect(b).toMatch(/^BMW-ARU-[A-Z0-9]{4}$/);
    expect(a).not.toBe(b);
  });

  it("never emits a character that could be misheard", () => {
    const codes = Array.from({ length: 200 }, () =>
      generateOrderReference(brand("halotel"), branch("halotel-dodoma")).slice(-4)
    ).join("");
    expect(codes).not.toMatch(/[0O1IL2SB]/);
  });

  it("stays in range when the random source returns its upper bound", () => {
    const reference = generateOrderReference(
      brand("ford"),
      branch("ford-dodoma"),
      fixedRandom(1)
    );
    expect(reference).toMatch(/^FOR-DOD-[A-Z0-9]{4}$/);
  });

  it("pads a name too short to fill three letters", () => {
    const tinyBrand: Brand = { ...brand("bmw"), name: "GT" };
    const reference = generateOrderReference(
      tinyBrand,
      branch("bmw-dar"),
      fixedRandom(0)
    );
    expect(reference.startsWith("GTX-DAR-")).toBe(true);
  });
});

describe("createOrderRequest", () => {
  const corolla = product("toyota-corolla");
  const hilux = product("toyota-hilux");

  function order(patch: Partial<ValidatedOrder> = {}): ValidatedOrder {
    return {
      quantity: 1,
      fullName: "Neema Mushi",
      phone: "+255754123456",
      address: "12 Sokoine Road, Arusha",
      agent: null,
      ...patch,
    };
  }

  it("addresses a brand-delivered order to the brand and its branch", () => {
    const request = createOrderRequest({
      product: corolla,
      brand: brand("toyota"),
      branch: branch("toyota-dar"),
      order: order({ quantity: 2 }),
      reference: "TOY-DAR-K7M4",
      requestedAt: "2026-08-14T09:00:00.000Z",
    });

    expect(request.route.kind).toBe("brand");
    expect(request.route.carrier).toBe("Toyota own fleet");
    expect(request.route.agentId).toBeUndefined();
    expect(request.lineTotalTZS).toBe(corolla.priceTZS * 2);
    expect(request.branch.city).toBe("Dar es Salaam");
  });

  it("addresses an agent-delivered order to the chosen courier", () => {
    const agent = agentRoute.agents.find(
      (a) => a.id === "arusha-swift-couriers"
    ) as DeliveryAgent;

    const request = createOrderRequest({
      product: hilux,
      brand: brand("toyota"),
      branch: branch("toyota-arusha"),
      order: order({ agent }),
      reference: "TOY-ARU-K7M4",
      requestedAt: "2026-08-14T09:00:00.000Z",
    });

    expect(request.route.kind).toBe("agent");
    expect(request.route.carrier).toBe("Arusha Swift Couriers");
    expect(request.route.agentId).toBe("arusha-swift-couriers");
    expect(request.route.agentPhone).toBe(agent.phone);
    // The record snapshots the rendered label, not the day counts — it is
    // what the customer was shown, kept readable without re-deriving it.
    expect(request.route.etaEstimate).toBe(formatEta(agent.eta));
    expect(request.route.etaEstimate).toBe("Same-day");
  });

  it("carries the branch phone only when the branch data has one", () => {
    const seed = {
      order: order(),
      reference: "TOY-DAR-K7M4",
      requestedAt: "2026-08-14T09:00:00.000Z",
    };

    const withPhone = createOrderRequest({
      ...seed,
      product: corolla,
      brand: brand("toyota"),
      branch: branch("toyota-dar"),
    });
    const withoutPhone = createOrderRequest({
      ...seed,
      product: hilux,
      brand: brand("toyota"),
      branch: branch("toyota-arusha"),
    });

    expect(withPhone.branch.phone).toBe("+255 22 286 0000");
    expect(withoutPhone.branch).not.toHaveProperty("phone");
  });

  it("generates its own reference and timestamp when none are given", () => {
    const before = Date.now();
    const request = createOrderRequest({
      product: corolla,
      brand: brand("toyota"),
      branch: branch("toyota-dar"),
      order: order(),
    });

    expect(request.reference).toMatch(/^TOY-DAR-[A-Z0-9]{4}$/);
    expect(Date.parse(request.requestedAt)).toBeGreaterThanOrEqual(before);
  });

  it("copies the price at request time rather than referencing the product", () => {
    const request = createOrderRequest({
      product: corolla,
      brand: brand("toyota"),
      branch: branch("toyota-dar"),
      order: order(),
    });
    expect(request.product.unitPriceTZS).toBe(corolla.priceTZS);
    expect(request.product.name).toBe(corolla.name);
  });
});

describe("order storage round trip", () => {
  const request = createOrderRequest({
    product: product("toyota-corolla"),
    brand: brand("toyota"),
    branch: branch("toyota-dar"),
    order: {
      quantity: 3,
      fullName: "Neema Mushi",
      phone: "+255754123456",
      address: "12 Sokoine Road, Arusha",
      agent: null,
    },
    reference: "TOY-DAR-K7M4",
    requestedAt: "2026-08-14T09:00:00.000Z",
  });

  it("uses a namespaced storage key", () => {
    expect(ORDER_STORAGE_KEY).toBe("soko:order-request");
  });

  it("survives a serialize/parse round trip unchanged", () => {
    expect(parseOrderRequest(serializeOrderRequest(request))).toEqual(request);
  });

  it("returns null for anything it cannot trust", () => {
    expect(parseOrderRequest(null)).toBeNull();
    expect(parseOrderRequest("")).toBeNull();
    expect(parseOrderRequest("{not json")).toBeNull();
    expect(parseOrderRequest("[]")).toBeNull();
    expect(parseOrderRequest('"a string"')).toBeNull();
    expect(parseOrderRequest("null")).toBeNull();
  });

  it("rejects a record missing the parts the confirmation screen renders", () => {
    const without = (key: keyof OrderRequest) => {
      const copy: Partial<OrderRequest> = { ...request };
      delete copy[key];
      return JSON.stringify(copy);
    };

    expect(parseOrderRequest(without("route"))).toBeNull();
    expect(parseOrderRequest(without("customer"))).toBeNull();
    expect(parseOrderRequest(without("reference"))).toBeNull();

    const badRoute = { ...request, route: { kind: "pigeon", carrier: "Ndege" } };
    expect(parseOrderRequest(JSON.stringify(badRoute))).toBeNull();
  });
});
