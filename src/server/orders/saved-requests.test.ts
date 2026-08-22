// @vitest-environment node
//
// firebase-admin cannot run in jsdom, and this file imports the module that
// pulls it in. Same reason `repositories.test.ts` opts out.

import { describe, expect, it } from "vitest";
import { getProductById } from "@/data";
import {
  buildOrderRequest,
  deleteFromCollection,
  isValidRequestId,
  sanitizeReference,
  sanitizeRequestedAt,
  type RequestCollection,
  type SaveOrderRequestInput,
} from "./saved-requests";

/**
 * These tests are about one property: **the browser does not get to say what
 * was ordered.** It says which product and who it is going to; everything with
 * a number attached is re-derived here from the catalogue.
 *
 * Real catalogue records, not fixtures. A fixture would let this suite keep
 * passing after a product changed shape, which is exactly the drift that makes
 * a test worthless.
 */

const BRAND_DELIVERED = "toyota-corolla"; // Dar branch, own fleet
const AGENT_ROUTED = "toyota-hilux"; // Arusha branch, courier-served
const OUT_OF_STOCK = "ford-everest";
const AGENT_IN_ARUSHA = "fargo-courier";

function input(overrides: Partial<SaveOrderRequestInput> = {}): SaveOrderRequestInput {
  return {
    productId: BRAND_DELIVERED,
    quantity: "2",
    fullName: "Asha Mwenda",
    phone: "0754123456",
    address: "Mikocheni B, near the Shell station",
    agentId: null,
    reference: "TOY-DAR-K7M4",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildOrderRequest — the trust boundary", () => {
  it("derives price and line total from the catalogue, not the request", () => {
    const product = getProductById(BRAND_DELIVERED)!;
    const result = buildOrderRequest(input({ quantity: "2" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.product.unitPriceTZS).toBe(product.priceTZS);
    expect(result.value.lineTotalTZS).toBe(product.priceTZS * 2);
    // The catalogue's name, not anything a client could have supplied.
    expect(result.value.product.name).toBe(product.name);
  });

  it("names the brand's own fleet as carrier for a delivering branch", () => {
    const result = buildOrderRequest(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.route.kind).toBe("brand");
    expect(result.value.route.agentId).toBeUndefined();
  });

  it("refuses an agent that does not serve the branch's city", () => {
    const result = buildOrderRequest(
      input({ productId: AGENT_ROUTED, agentId: "an-agent-that-does-not-exist" })
    );
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("accepts an agent that does serve it, and records that agent", () => {
    const result = buildOrderRequest(
      input({ productId: AGENT_ROUTED, agentId: AGENT_IN_ARUSHA })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.route.kind).toBe("agent");
    expect(result.value.route.agentId).toBe(AGENT_IN_ARUSHA);
  });

  it("ignores a stray agent choice on a brand-delivered order", () => {
    // The form drops it too; asserting it here means a client that bypasses the
    // form cannot attach a courier to an order the brand is carrying.
    const result = buildOrderRequest(input({ agentId: AGENT_IN_ARUSHA }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.route.kind).toBe("brand");
  });

  it("rejects an unknown product rather than storing a shell record", () => {
    expect(buildOrderRequest(input({ productId: "not-a-product" }))).toEqual({
      ok: false,
      reason: "unknown-product",
    });
  });

  it("rejects a product that cannot be ordered at all", () => {
    expect(buildOrderRequest(input({ productId: OUT_OF_STOCK }))).toEqual({
      ok: false,
      reason: "not-orderable",
    });
  });

  it("re-runs the customer-detail rules the form already applied", () => {
    // A landline: the form rejects it, and so must the server, or bypassing
    // the form becomes a way to store an unroutable order.
    expect(buildOrderRequest(input({ phone: "0222110000" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(buildOrderRequest(input({ quantity: "0" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(buildOrderRequest(input({ quantity: "100" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("normalises the phone number it stores", () => {
    const result = buildOrderRequest(input({ phone: "0754 123 456" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.customer.phone).toBe("+255754123456");
  });

  it("keeps a well-formed reference so both copies match", () => {
    const result = buildOrderRequest(input({ reference: "TOY-DAR-K7M4" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reference).toBe("TOY-DAR-K7M4");
  });

  it("replaces a reference that has been tampered with", () => {
    const result = buildOrderRequest(input({ reference: "<script>alert(1)</script>" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reference).not.toContain("script");
    expect(result.value.reference).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{4}$/);
  });
});

describe("sanitizeReference", () => {
  it("accepts the shape the generator produces", () => {
    expect(sanitizeReference("TOY-DAR-K7M4")).toBe("TOY-DAR-K7M4");
    expect(sanitizeReference("HAL-MWA-XY39")).toBe("HAL-MWA-XY39");
  });

  it("rejects the ambiguous glyphs the alphabet deliberately excludes", () => {
    // 0/O/1/I/L/S/B/2 are out precisely because references get read aloud.
    expect(sanitizeReference("TOY-DAR-0OIL")).toBeUndefined();
  });

  it("rejects anything that is not a reference", () => {
    expect(sanitizeReference("")).toBeUndefined();
    expect(sanitizeReference("../../etc/passwd")).toBeUndefined();
    expect(sanitizeReference(null)).toBeUndefined();
    expect(sanitizeReference(42)).toBeUndefined();
    expect(sanitizeReference("TOY-DAR-K7M4 ")).toBeUndefined();
  });
});

describe("sanitizeRequestedAt", () => {
  const now = Date.parse("2026-08-16T10:00:00.000Z");

  it("keeps a timestamp from around now", () => {
    expect(sanitizeRequestedAt("2026-08-16T09:59:00.000Z", now)).toBe(
      "2026-08-16T09:59:00.000Z"
    );
  });

  it("drops one from outside the trusted window", () => {
    // A browser clock years out, or a client backdating a request.
    expect(sanitizeRequestedAt("2019-01-01T00:00:00.000Z", now)).toBeUndefined();
    expect(sanitizeRequestedAt("2030-01-01T00:00:00.000Z", now)).toBeUndefined();
  });

  it("drops anything unparseable", () => {
    expect(sanitizeRequestedAt("yesterday", now)).toBeUndefined();
    expect(sanitizeRequestedAt(undefined, now)).toBeUndefined();
  });

  it("falls back to the server clock when dropped", () => {
    const result = buildOrderRequest(input({ requestedAt: "not a date" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isNaN(Date.parse(result.value.requestedAt))).toBe(false);
  });
});

describe("isValidRequestId", () => {
  it("accepts a Firestore auto id", () => {
    expect(isValidRequestId("aBcDeFgHiJkLmNoPqRsT")).toBe(true);
  });

  it("rejects an id carrying a path separator", () => {
    // The one that matters. `collection.doc("a/b/c")` is legal Firestore and
    // addresses a nested document, so an id echoed straight back from the
    // browser is a way out of the customer's own subcollection.
    expect(isValidRequestId("aBcDeFgHiJkLmNoPqR/x")).toBe(false);
    expect(isValidRequestId("../../customers/other")).toBe(false);
  });

  it("rejects the wrong length, and anything that is not a string", () => {
    expect(isValidRequestId("tooShort")).toBe(false);
    expect(isValidRequestId("aBcDeFgHiJkLmNoPqRsTu")).toBe(false);
    expect(isValidRequestId(null)).toBe(false);
    expect(isValidRequestId(42)).toBe(false);
  });
});

describe("deleteFromCollection", () => {
  const VALID = "aBcDeFgHiJkLmNoPqRsT";

  /** A Firestore stand-in that records what was asked of it. */
  function fakeCollection(exists: boolean) {
    const calls = { get: 0, delete: 0, ids: [] as string[] };
    const collection: RequestCollection = {
      doc(id: string) {
        calls.ids.push(id);
        return {
          async get() {
            calls.get += 1;
            return { exists };
          },
          async delete() {
            calls.delete += 1;
          },
        };
      },
    };
    return { collection, calls };
  }

  it("deletes a request that exists", async () => {
    const { collection, calls } = fakeCollection(true);
    await expect(deleteFromCollection(collection, VALID)).resolves.toEqual({
      deleted: true,
    });
    expect(calls.delete).toBe(1);
    expect(calls.ids).toEqual([VALID]);
  });

  it("reports not-found instead of claiming success", async () => {
    // Firestore's delete() resolves happily for a document that was never
    // there, so without the read first this path would tell the customer their
    // details were removed when nothing was.
    const { collection, calls } = fakeCollection(false);
    await expect(deleteFromCollection(collection, VALID)).resolves.toEqual({
      deleted: false,
      reason: "not-found",
    });
    expect(calls.delete).toBe(0);
  });

  it("never touches Firestore for a malformed id", async () => {
    const { collection, calls } = fakeCollection(true);
    await expect(
      deleteFromCollection(collection, "aBcDeFgHiJkLmNoPqR/x")
    ).resolves.toEqual({ deleted: false, reason: "invalid-id" });
    expect(calls.ids).toEqual([]);
    expect(calls.get).toBe(0);
    expect(calls.delete).toBe(0);
  });
});
