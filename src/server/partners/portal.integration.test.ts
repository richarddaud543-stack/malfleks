// @vitest-environment node
//
// Runs against a real Postgres schema built from the committed migrations,
// for one reason: **the property under test is that a partner cannot see
// another partner's listings**, and that property lives entirely in the WHERE
// clauses. A mocked Prisma client would return whatever the mock was told to
// return and would pass just as happily with the scoping deleted.
//
// The mutation to try if you doubt these tests earn their runtime: drop
// `where: { partnerId }` from `listSubmissionsForPartner`. Every test in this
// file that names isolation fails, and nothing else in the suite notices.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { seedDatabase } from "@/server/db/seed";
import {
  countSubmissionsForPartner,
  listSubmissionsForPartner,
  partnerForUser,
} from "./portal";
import { submitProduct } from "./submissions";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("portal");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let seq = 0;

/** A brand partner wired to a seeded branch, with a signed-in user attached. */
async function partnerWithUser(
  overrides: { kind?: string; status?: string; branchId?: string | null } = {},
) {
  seq += 1;
  const uid = `uid-${seq}-${Date.now()}`;

  const partner = await getPrisma().partner.create({
    data: {
      kind: overrides.kind ?? "brand",
      status: overrides.status ?? "active",
      displayName: `Portal Partner ${seq}`,
      contactName: "Asha Mwenda",
      phone: "+255754123456",
      city: "Dar es Salaam",
      brandId: "toyota",
      branchId:
        overrides.branchId === undefined ? "toyota-dar" : overrides.branchId,
      applicationId: `portal-app-${seq}-${Date.now()}`,
      approvedBy: "admin-0",
      users: { create: { uid, role: "owner" } },
    },
    select: { id: true },
  });

  return { partnerId: partner.id, uid };
}

let productSeq = 0;

async function submit(partnerId: string, name?: string) {
  productSeq += 1;
  const outcome = await submitProduct(partnerId, {
    name: name ?? `Portal Product ${productSeq}`,
    category: "electronics",
    priceTZS: 120_000,
    image: "smartphone",
    description: "A product submitted by a branch partner.",
  });
  if (!outcome.ok) throw new Error(`fixture setup failed: ${outcome.reason}`);
  return outcome.value.id;
}

describe("partnerForUser", () => {
  it("resolves the partner a signed-in user acts for", async () => {
    const { partnerId, uid } = await partnerWithUser();

    const identity = await partnerForUser(uid);

    expect(identity).not.toBeNull();
    expect(identity?.partnerId).toBe(partnerId);
    expect(identity?.kind).toBe("brand");
    expect(identity?.status).toBe("active");
    expect(identity?.branchId).toBe("toyota-dar");
    expect(identity?.role).toBe("owner");
  });

  // The common case. A customer is not an error.
  it("returns null for an ordinary signed-in customer", async () => {
    expect(await partnerForUser(`customer-${Date.now()}`)).toBeNull();
  });

  it("returns null for an empty uid rather than matching a row", async () => {
    // A blank uid reaching a `findUnique` is a bug upstream, but it must never
    // be the thing that hands someone a partner account.
    expect(await partnerForUser("")).toBeNull();
    expect(await partnerForUser("   ")).toBeNull();
  });

  it("reports a suspended partner as suspended rather than hiding them", async () => {
    // Hiding a suspended partner would 404 their own dashboard and leave them
    // with no way to read why. They may look; they may not submit.
    const { uid } = await partnerWithUser({ status: "suspended" });

    expect((await partnerForUser(uid))?.status).toBe("suspended");
  });

  it("carries a null branchId for a partner not yet wired to the catalogue", async () => {
    // Approval is not publication: `Partner.branchId` stays null until someone
    // connects it by hand, and the dashboard says so out loud.
    const { uid } = await partnerWithUser({ branchId: null });

    expect((await partnerForUser(uid))?.branchId).toBeNull();
  });
});

describe("listSubmissionsForPartner", () => {
  it("returns only this partner's submissions", async () => {
    const mine = await partnerWithUser();
    const theirs = await partnerWithUser();

    const mineId = await submit(mine.partnerId, "Mine");
    const theirsId = await submit(theirs.partnerId, "Theirs");

    const rows = await listSubmissionsForPartner(mine.partnerId);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(mineId);
    expect(ids).not.toContain(theirsId);
    expect(rows.every((row) => row.name !== "Theirs")).toBe(true);
  });

  it("is empty for a partner who has submitted nothing", async () => {
    const { partnerId } = await partnerWithUser();

    expect(await listSubmissionsForPartner(partnerId)).toEqual([]);
  });

  it("returns newest first", async () => {
    const { partnerId } = await partnerWithUser();
    await submit(partnerId, "Older");
    // Distinct timestamps: `createdAt` defaults to now() and two inserts in the
    // same millisecond would make the order arbitrary rather than wrong.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await submit(partnerId, "Newer");

    const rows = await listSubmissionsForPartner(partnerId);

    expect(rows.map((row) => row.name)).toEqual(["Newer", "Older"]);
  });

  it("carries the decision note, which is the only place a rejection is explained", async () => {
    const { partnerId } = await partnerWithUser();
    const id = await submit(partnerId);
    await getPrisma().productSubmission.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        decisionNote: "The price looks like a typo.",
      },
    });

    const row = (await listSubmissionsForPartner(partnerId)).find(
      (r) => r.id === id,
    );

    expect(row?.status).toBe("rejected");
    expect(row?.decisionNote).toBe("The price looks like a typo.");
  });
});

describe("countSubmissionsForPartner", () => {
  it("counts each status, and only this partner's rows", async () => {
    const mine = await partnerWithUser();
    const theirs = await partnerWithUser();

    const pending = await submit(mine.partnerId);
    const published = await submit(mine.partnerId);
    const rejected = await submit(mine.partnerId);
    // Another partner's rows, in every status, must not appear in my totals.
    await submit(theirs.partnerId);
    await submit(theirs.partnerId);

    await getPrisma().productSubmission.update({
      where: { id: published },
      data: { status: "published", reviewedAt: new Date() },
    });
    await getPrisma().productSubmission.update({
      where: { id: rejected },
      data: { status: "rejected", reviewedAt: new Date() },
    });

    expect(await countSubmissionsForPartner(mine.partnerId)).toEqual({
      pending: 1,
      published: 1,
      rejected: 1,
    });
    expect(pending).toBeTruthy();
  });

  it("is all zeroes for a partner with nothing submitted", async () => {
    const { partnerId } = await partnerWithUser();

    expect(await countSubmissionsForPartner(partnerId)).toEqual({
      pending: 0,
      published: 0,
      rejected: 0,
    });
  });
});
