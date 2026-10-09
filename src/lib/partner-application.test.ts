import { describe, expect, it } from "vitest";
import { brands } from "@/data";
import {
  SERVED_CITIES,
  emptyPartnerApplication,
  validatePartnerApplication,
  type PartnerApplicationInput,
} from "./partner-application";

/**
 * What this file holds: **the form cannot be talked into storing something the
 * admin queue would have to puzzle over.**
 *
 * Real brand ids from the catalogue rather than fixtures, matching the
 * convention in `saved-requests.test.ts` — a fixture would let this suite keep
 * passing after the brand list changed shape, which is exactly the drift that
 * makes a test worthless.
 */

const BRAND_IDS = brands.map((b) => b.id);
const A_REAL_BRAND = brands[0].id;

function input(
  overrides: Partial<PartnerApplicationInput> = {}
): PartnerApplicationInput {
  return {
    ...emptyPartnerApplication,
    kind: "brand",
    businessName: "Toyota Arusha Showroom",
    contactName: "Asha Mwenda",
    phone: "0754123456",
    city: "Arusha",
    brandId: A_REAL_BRAND,
    address: "Sokoine Road, near the clock tower",
    // A brand application must answer this since 6 Oct 2026 -- see the
    // "requires an answer about delivery" tests below.
    deliveryMode: "customer_pays",
    ...overrides,
  };
}

describe("validatePartnerApplication — a brand branch", () => {
  it("accepts a complete application and normalises the phone", () => {
    const result = validatePartnerApplication(input(), BRAND_IDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phone).toBe("+255754123456");
    expect(result.value.brandId).toBe(A_REAL_BRAND);
    expect(result.value.brandOther).toBeNull();
  });

  it("requires a brand — either one we know or a name", () => {
    const result = validatePartnerApplication(
      input({ brandId: "", brandOther: "" }),
      BRAND_IDS
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.brandId).toBeTruthy();
  });

  it("accepts a brand the catalogue has never heard of", () => {
    // The whole point of `brandOther`: a real shop selling a brand MalFleks has not
    // added yet must still be able to apply, and the admin resolves it later.
    const result = validatePartnerApplication(
      input({ brandId: "", brandOther: "Sayona Electronics" }),
      BRAND_IDS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brandId).toBeNull();
    expect(result.value.brandOther).toBe("Sayona Electronics");
  });

  it("rejects a brand id that is not in the catalogue", () => {
    // Guards a hand-edited select: a forged id would otherwise attach the
    // application to a brand that does not exist.
    const result = validatePartnerApplication(
      input({ brandId: "not-a-real-brand" }),
      BRAND_IDS
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.brandId).toBeTruthy();
  });

  it("requires an address, because a branch is somewhere", () => {
    const result = validatePartnerApplication(input({ address: "" }), BRAND_IDS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.address).toBeTruthy();
  });
});

describe("validatePartnerApplication — a courier", () => {
  const courier = () =>
    input({
      kind: "courier",
      businessName: "Arusha Swift Couriers",
      brandId: "",
      brandOther: "",
      address: "",
    });

  it("accepts one without a brand or an address", () => {
    const result = validatePartnerApplication(courier(), BRAND_IDS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.brandId).toBeNull();
    expect(result.value.address).toBeNull();
  });

  it("drops a stray brand answer rather than storing it", () => {
    // A courier who switched from the brand tab leaves values behind in state.
    // Storing them would put a brand on a courier record and confuse whoever
    // reviews it, so they are discarded here rather than at the database.
    const result = validatePartnerApplication(
      courier(),
      BRAND_IDS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const withLeftovers = validatePartnerApplication(
      { ...courier(), brandId: A_REAL_BRAND, address: "Somewhere" },
      BRAND_IDS
    );
    expect(withLeftovers.ok).toBe(true);
    if (!withLeftovers.ok) return;
    expect(withLeftovers.value.brandId).toBeNull();
    expect(withLeftovers.value.address).toBeNull();
  });
});

describe("validatePartnerApplication — who pays for delivery", () => {
  it("requires an answer from a brand branch", () => {
    const result = validatePartnerApplication(input({ deliveryMode: "" }), BRAND_IDS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.deliveryMode).toBeTruthy();
  });

  it("accepts each of the three answers and keeps it", () => {
    for (const mode of ["customer_pays", "split", "shop_delivers"] as const) {
      const result = validatePartnerApplication(input({ deliveryMode: mode }), BRAND_IDS);
      expect(result.ok, mode).toBe(true);
      if (result.ok) expect(result.value.deliveryMode).toBe(mode);
    }
  });

  it("refuses an answer that is not one of the three", () => {
    // A hand-edited form could name anything. "free" is not a delivery policy.
    for (const mode of ["free", "SPLIT", "shop", "customer"]) {
      const result = validatePartnerApplication(input({ deliveryMode: mode }), BRAND_IDS);
      expect(result.ok, mode).toBe(false);
    }
  });

  it("does not ask a courier, and drops a stray answer from one", () => {
    const result = validatePartnerApplication(
      input({ kind: "courier", address: "", brandId: "", deliveryMode: "shop_delivers" }),
      BRAND_IDS,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.deliveryMode).toBeNull();
  });

  it("accepts a courier that answered nothing", () => {
    const result = validatePartnerApplication(
      input({ kind: "courier", address: "", brandId: "", deliveryMode: "" }),
      BRAND_IDS,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.deliveryMode).toBeNull();
  });
});

describe("validatePartnerApplication — shared rules", () => {
  it("accepts every city MalFleks serves", () => {
    for (const city of SERVED_CITIES) {
      const result = validatePartnerApplication(input({ city }), BRAND_IDS);
      expect(result.ok, `${city} should be accepted`).toBe(true);
    }
  });

  it("refuses a city MalFleks does not cover", () => {
    const result = validatePartnerApplication(input({ city: "Mbeya" }), BRAND_IDS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.city).toBeTruthy();
  });

  it("takes either phone format and rejects a landline", () => {
    for (const phone of ["0754123456", "+255754123456", "0754 123 456"]) {
      const result = validatePartnerApplication(input({ phone }), BRAND_IDS);
      expect(result.ok, `${phone} should be accepted`).toBe(true);
      if (result.ok) expect(result.value.phone).toBe("+255754123456");
    }

    // Tanzanian mobiles start 6 or 7; 022 is a Dar landline.
    const landline = validatePartnerApplication(
      input({ phone: "0222123456" }),
      BRAND_IDS
    );
    expect(landline.ok).toBe(false);
  });

  it("collects every problem at once rather than one at a time", () => {
    const result = validatePartnerApplication(
      input({ businessName: "", contactName: "", phone: "", city: "", deliveryMode: "" }),
      BRAND_IDS
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "businessName",
      "city",
      "contactName",
      "deliveryMode",
      "phone",
    ]);
  });

  it("trims whitespace instead of storing it", () => {
    const result = validatePartnerApplication(
      input({ businessName: "  Toyota Arusha  ", notes: "   " }),
      BRAND_IDS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.businessName).toBe("Toyota Arusha");
    expect(result.value.notes).toBeNull();
  });
});
