// @vitest-environment node
//
// Runs against a real Postgres schema built from the committed migrations,
// because what is under test is a multi-table transaction and its unique
// constraints. A mocked client would happily report success for a half-written
// activation, which is the exact failure this module is shaped to prevent: a
// branch with no partner pointing at it, or a partner pointing at a branch that
// was never inserted.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import {
  activateBrandPartner,
  activateCourierPartner,
  listActivatablePartners,
  slugify,
  type BrandActivationInput,
  type CourierActivationInput,
} from "./activation";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("activation");
  // Deliberately NOT seeded. This module's whole job is the empty-catalogue
  // case: the first real brand and the first real courier arriving.
}, 180_000);

afterAll(async () => {
  await db.teardown();
});


/** `.reason` off the union, so a failure assertion reads in one line. */
function reasonOf(outcome: { ok: boolean } & Record<string, unknown>): string | undefined {
  return outcome.ok ? undefined : (outcome.reason as string);
}

let seq = 0;

async function approvedPartner(
  kind: "brand" | "courier",
  overrides: { status?: string; city?: string; licenceChecked?: boolean } = {},
) {
  seq += 1;
  const partner = await getPrisma().partner.create({
    data: {
      kind,
      status: overrides.status ?? "active",
      displayName: `Partner ${seq}`,
      contactName: "Asha Mwenda",
      phone: "+255754123456",
      city: overrides.city ?? "Dar es Salaam",
      applicationId: `act-app-${seq}-${Date.now()}`,
      approvedBy: "admin-0",
      // A rider's licence is checked unless a test says otherwise: these are
      // about the routing form, and an unchecked rider is refused first.
      ...(kind === "courier" && overrides.licenceChecked !== false ? { documentsVerifiedAt: new Date(), documentsVerifiedBy: "admin-0" } : {}),
    },
    select: { id: true },
  });
  return partner.id;
}

function brandInput(overrides: Partial<BrandActivationInput> = {}): BrandActivationInput {
  seq += 1;
  return {
    brandId: null,
    brandName: `Brand ${seq}`,
    category: "electronics",
    branchName: `Branch ${seq}`,
    city: "Dar es Salaam",
    addressLine: null,
    phone: null,
    hours: null,
    deliveryOffered: false,
    verified: false,
    ...overrides,
  };
}

function courierInput(
  overrides: Partial<CourierActivationInput> = {},
): CourierActivationInput {
  seq += 1;
  return {
    name: `Courier ${seq}`,
    city: "Dar es Salaam",
    regionsServed: [],
    etaMinDays: 1,
    etaMaxDays: 2,
    phone: null,
    verified: false,
    ...overrides,
  };
}

describe("activateBrandPartner", () => {
  it("creates the brand, the branch, and points the partner at both", async () => {
    const partnerId = await approvedPartner("brand");
    const input = brandInput({ brandName: "Kariakoo Electronics" });

    const outcome = await activateBrandPartner(partnerId, input);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const partner = await getPrisma().partner.findUnique({
      where: { id: partnerId },
      select: { brandId: true, branchId: true },
    });
    // The link is the point. A branch nobody owns cannot be listed against.
    expect(partner?.brandId).toBe(outcome.value.brandId);
    expect(partner?.branchId).toBe(outcome.value.branchId);

    const branch = await getPrisma().branch.findUnique({
      where: { id: outcome.value.branchId as string },
    });
    expect(branch?.brandId).toBe(outcome.value.brandId);
    expect(branch?.city).toBe("Dar es Salaam");
    // The locator needs a position or the branch is invisible on the map.
    expect(branch?.latitude).toBeCloseTo(-6.7924, 3);
    expect(branch?.longitude).toBeCloseTo(39.2083, 3);
  });

  it("leaves the address and hours null when they were not confirmed", async () => {
    const partnerId = await approvedPartner("brand");

    const outcome = await activateBrandPartner(partnerId, brandInput());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const branch = await getPrisma().branch.findUnique({
      where: { id: outcome.value.branchId as string },
    });
    // Inventing either is the mistake this whole codebase was corrected for.
    expect(branch?.addressLine).toBeNull();
    expect(branch?.hours).toBeNull();
    expect(branch?.verified).toBe(false);
  });

  it("records verified only when the admin says so", async () => {
    const partnerId = await approvedPartner("brand");

    const outcome = await activateBrandPartner(
      partnerId,
      brandInput({ verified: true, addressLine: "194 Chato Street, Mikocheni" }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const branch = await getPrisma().branch.findUnique({
      where: { id: outcome.value.branchId as string },
    });
    expect(branch?.verified).toBe(true);
    expect(branch?.addressLine).toBe("194 Chato Street, Mikocheni");
  });

  it("gives a new brand an empty logo rather than a path to a file that isn't there", async () => {
    const partnerId = await approvedPartner("brand");

    const outcome = await activateBrandPartner(partnerId, brandInput());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const brand = await getPrisma().brand.findUnique({
      where: { id: outcome.value.brandId as string },
    });
    // BrandLogo draws a monogram for this; a made-up /images/... path would be
    // four broken images across the site.
    expect(brand?.logo).toBe("");
  });

  it("attaches a second branch to an existing brand instead of duplicating it", async () => {
    const first = await approvedPartner("brand");
    const created = await activateBrandPartner(
      first,
      brandInput({ brandName: "Shared Brand Co", city: "Dar es Salaam" }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const second = await approvedPartner("brand", { city: "Arusha" });
    const outcome = await activateBrandPartner(
      second,
      brandInput({ brandId: created.value.brandId as string, city: "Arusha" }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.brandId).toBe(created.value.brandId);
    expect(
      await getPrisma().brand.count({ where: { name: "Shared Brand Co" } }),
    ).toBe(1);
    expect(
      await getPrisma().branch.count({
        where: { brandId: created.value.brandId as string },
      }),
    ).toBe(2);
  });

  it("refuses a second activation of the same partner", async () => {
    const partnerId = await approvedPartner("brand");
    expect((await activateBrandPartner(partnerId, brandInput())).ok).toBe(true);

    // Without this guard the first branch is silently orphaned — still on the
    // map, with nobody able to list against it.
    expect(await activateBrandPartner(partnerId, brandInput())).toEqual({
      ok: false,
      reason: "already-live",
    });
  });

  it("refuses a courier, a suspended partner, and a partner that isn't there", async () => {
    const courier = await approvedPartner("courier");
    expect(reasonOf(await activateBrandPartner(courier, brandInput()))).toBe(
      "wrong-kind",
    );

    const suspended = await approvedPartner("brand", { status: "suspended" });
    expect(reasonOf(await activateBrandPartner(suspended, brandInput()))).toBe(
      "partner-suspended",
    );

    expect(reasonOf(await activateBrandPartner("nope", brandInput()))).toBe(
      "not-found",
    );
  });

  it("refuses a city MalFleks does not serve rather than putting a pin in the sea", async () => {
    const partnerId = await approvedPartner("brand");

    expect(
      reasonOf(await activateBrandPartner(partnerId, brandInput({ city: "Nairobi" }))),
    ).toBe("unknown-city");
  });

  it("refuses an empty branch name", async () => {
    const partnerId = await approvedPartner("brand");

    expect(
      reasonOf(await activateBrandPartner(partnerId, brandInput({ branchName: "   " }))),
    ).toBe("missing-field");
  });

  it("reports a collision as name-taken, and writes nothing", async () => {
    const first = await approvedPartner("brand");
    expect(
      (await activateBrandPartner(first, brandInput({ brandName: "Twice Ltd" })))
        .ok,
    ).toBe(true);

    const second = await approvedPartner("brand");
    const outcome = await activateBrandPartner(
      second,
      brandInput({ brandName: "Twice Ltd" }),
    );

    expect(outcome).toEqual({ ok: false, reason: "name-taken" });
    // The transaction must have rolled back: the second partner is untouched.
    const partner = await getPrisma().partner.findUnique({
      where: { id: second },
      select: { brandId: true, branchId: true },
    });
    expect(partner?.branchId).toBeNull();
  });
});

describe("activateCourierPartner", () => {
  it("refuses a rider whose driving licence nobody has checked", async () => {
    const partnerId = await approvedPartner("courier", { licenceChecked: false });
    expect(await activateCourierPartner(partnerId, courierInput())).toEqual({ ok: false, reason: "licence-not-checked" });
    expect((await getPrisma().partner.findUniqueOrThrow({ where: { id: partnerId } })).agentId).toBeNull();
  });

  it("creates the agent, its regions, and links the partner", async () => {
    const partnerId = await approvedPartner("courier");

    const outcome = await activateCourierPartner(
      partnerId,
      courierInput({ name: "Pikipiki Express", regionsServed: ["Pwani"] }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const agent = await getPrisma().deliveryAgent.findUnique({
      where: { id: outcome.value.agentId as string },
      include: { regionsServed: true },
    });
    expect(agent?.name).toBe("Pikipiki Express");
    // Their own city is always served, whatever the form said.
    expect(agent?.regionsServed.map((r) => r.region).sort()).toEqual([
      "Dar es Salaam",
      "Pwani",
    ]);
    expect(
      (
        await getPrisma().partner.findUnique({
          where: { id: partnerId },
          select: { agentId: true },
        })
      )?.agentId,
    ).toBe(outcome.value.agentId);
  });

  it("does not duplicate the home city when the form repeats it", async () => {
    const partnerId = await approvedPartner("courier");

    const outcome = await activateCourierPartner(
      partnerId,
      courierInput({ regionsServed: ["Dar es Salaam", "Dar es Salaam"] }),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // AgentRegion's primary key is (agentId, region); a duplicate would abort
    // the whole transaction.
    expect(
      await getPrisma().agentRegion.count({
        where: { agentId: outcome.value.agentId as string },
      }),
    ).toBe(1);
  });

  it("accepts a same-day courier and rejects a backwards range", async () => {
    const sameDay = await approvedPartner("courier");
    expect(
      (
        await activateCourierPartner(
          sameDay,
          courierInput({ etaMinDays: 0, etaMaxDays: 0 }),
        )
      ).ok,
    ).toBe(true);

    const backwards = await approvedPartner("courier");
    // formatEta would render "3–1 days".
    expect(
      reasonOf(await activateCourierPartner(
          backwards,
          courierInput({ etaMinDays: 3, etaMaxDays: 1 }),
        )),
    ).toBe("invalid-eta");

    const fractional = await approvedPartner("courier");
    expect(
      reasonOf(await activateCourierPartner(
          fractional,
          courierInput({ etaMinDays: 1.5, etaMaxDays: 2 }),
        )),
    ).toBe("invalid-eta");
  });

  it("refuses a brand partner and a second activation", async () => {
    const brand = await approvedPartner("brand");
    expect(reasonOf(await activateCourierPartner(brand, courierInput()))).toBe(
      "wrong-kind",
    );

    const courier = await approvedPartner("courier");
    expect((await activateCourierPartner(courier, courierInput())).ok).toBe(true);
    expect(reasonOf(await activateCourierPartner(courier, courierInput()))).toBe(
      "already-live",
    );
  });
});

describe("listActivatablePartners", () => {
  it("lists only partners with nothing live yet", async () => {
    const waiting = await approvedPartner("brand");
    const done = await approvedPartner("brand");
    await activateBrandPartner(done, brandInput());

    const ids = (await listActivatablePartners()).map((p) => p.partnerId);

    expect(ids).toContain(waiting);
    expect(ids).not.toContain(done);
  });

  it("excludes suspended partners — there is nothing to publish for them", async () => {
    const suspended = await approvedPartner("brand", { status: "suspended" });

    expect(
      (await listActivatablePartners()).map((p) => p.partnerId),
    ).not.toContain(suspended);
  });
});

describe("slugify", () => {
  it("makes a URL-safe id from a business name", () => {
    expect(slugify("Kariakoo Electronics")).toBe("kariakoo-electronics");
    expect(slugify("  MalFleks & Co.  ")).toBe("malfleks-co");
  });

  it("returns an empty string when there is nothing to slug", () => {
    // Callers treat this as missing-field rather than creating id "".
    expect(slugify("!!!")).toBe("");
  });
});
