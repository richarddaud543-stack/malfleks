// @vitest-environment node
//
// Runs against a real Postgres schema built from the committed migrations,
// for the same reason `review.integration.test.ts` does: the property under
// test is that the *database* refuses a second publish of the same
// submission, and a mocked Prisma client would return whatever it was told to.
//
// The scenario is the one `review.ts` already paid for once — two admin tabs
// open on the review queue, both clicking Publish on the same row. Sequential
// calls cannot exercise it: by the time the second call's pre-check runs, the
// first has already flipped the status. Only the `Promise.all` cases below
// interleave the reads before either write, which is what the
// `updateMany`-with-status-in-WHERE guard exists for. Do not delete them.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { seedDatabase } from "@/server/db/seed";
import {
  canPublish,
  publishSubmission,
  rejectSubmission,
  slugForSubmission,
  submitProduct,
} from "./submissions";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("submissions");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

let partnerSeq = 0;

/** A brand partner already wired to a real seeded branch. */
async function branchPartner(
  overrides: { status?: string; kind?: string; branchId?: string | null } = {},
) {
  partnerSeq += 1;
  const partner = await getPrisma().partner.create({
    data: {
      kind: overrides.kind ?? "brand",
      status: overrides.status ?? "active",
      displayName: `Test Partner ${partnerSeq}`,
      contactName: "Asha Mwenda",
      phone: "+255754123456",
      city: "Dar es Salaam",
      brandId: "toyota",
      branchId:
        overrides.branchId === undefined ? "toyota-dar" : overrides.branchId,
      applicationId: `app-${partnerSeq}-${Date.now()}`,
      approvedBy: "admin-0",
    },
    select: { id: true },
  });
  return partner.id;
}

let productSeq = 0;

function productInput(overrides: Record<string, unknown> = {}) {
  productSeq += 1;
  return {
    name: `Test Product ${productSeq}`,
    category: "electronics",
    priceTZS: 65_000,
    // A real icon key. This fixture used to say "/images/products/test.svg",
    // which the server accepted only because it was not checking the picture
    // against the list at all — see "runs the same rules as the form" below.
    image: "smartphone",
    description: "A product submitted by a branch partner.",
    specs: [
      { key: "Colour", value: "Black" },
      { key: "Warranty", value: "12 months" },
    ],
    ...overrides,
  };
}

async function pendingSubmission(partnerId?: string) {
  const pid = partnerId ?? (await branchPartner());
  const outcome = await submitProduct(pid, productInput());
  if (!outcome.ok) throw new Error(`fixture setup failed: ${outcome.reason}`);
  return outcome.value.id;
}

describe("canPublish — pure", () => {
  it("rejects a submission that does not exist", () => {
    expect(canPublish(null, false)).toEqual({ ok: false, reason: "not-found" });
  });

  it.each(["published", "rejected"])("rejects one already %s", (status) => {
    expect(canPublish({ status, branchId: "toyota-dar" }, false)).toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });

  it("rejects one whose partner was never wired to a branch", () => {
    expect(canPublish({ status: "pending", branchId: null }, false)).toEqual({
      ok: false,
      reason: "no-branch",
    });
  });

  it("rejects one whose slug is already taken", () => {
    expect(canPublish({ status: "pending", branchId: "toyota-dar" }, true)).toEqual({
      ok: false,
      reason: "slug-taken",
    });
  });

  it("allows a pending submission with a branch and a free slug", () => {
    expect(canPublish({ status: "pending", branchId: "toyota-dar" }, false)).toEqual({
      ok: true,
    });
  });
});

describe("slugForSubmission", () => {
  it("scopes the slug by branch so two branches may list the same name", () => {
    expect(slugForSubmission("Corolla GLi", "toyota-dar")).not.toBe(
      slugForSubmission("Corolla GLi", "toyota-arusha"),
    );
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugForSubmission("  Corolla   GLi (2026)!  ", "toyota-dar")).toBe(
      "toyota-dar-corolla-gli-2026",
    );
  });

  it("falls back to the branch when the name has no usable characters", () => {
    expect(slugForSubmission("!!!", "toyota-dar")).toBe("toyota-dar");
  });
});

describe("submitProduct — the trust boundary", () => {
  it("derives branchId and brandId from the partner, never from the caller", async () => {
    const partnerId = await branchPartner();
    const outcome = await submitProduct(
      partnerId,
      // A caller trying to name someone else's branch. The input type has no
      // such field, and the value must not survive into the row either way.
      productInput({ branchId: "bmw-arusha", brandId: "bmw" }) as never,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });
    expect(row.branchId).toBe("toyota-dar");
    expect(row.brandId).toBe("toyota");
  });

  it("stores specs as ordered rows", async () => {
    const id = await pendingSubmission();
    const specs = await getPrisma().productSubmissionSpec.findMany({
      where: { submissionId: id },
      orderBy: { position: "asc" },
    });
    expect(specs.map((s) => s.key)).toEqual(["Colour", "Warranty"]);
    expect(specs.map((s) => s.position)).toEqual([0, 1]);
  });

  it("refuses a partner that does not exist", async () => {
    await expect(submitProduct("no-such-partner", productInput())).resolves.toEqual({
      ok: false,
      reason: "not-a-partner",
    });
  });

  it("refuses a courier — a courier has no products to list", async () => {
    const courier = await branchPartner({ kind: "courier" });
    await expect(submitProduct(courier, productInput())).resolves.toEqual({
      ok: false,
      reason: "not-a-branch-partner",
    });
  });

  it("refuses a suspended partner", async () => {
    const suspended = await branchPartner({ status: "suspended" });
    await expect(submitProduct(suspended, productInput())).resolves.toEqual({
      ok: false,
      reason: "partner-suspended",
    });
  });

  it.each([0, -1, 1.5])("refuses a price of %s", async (priceTZS) => {
    const partnerId = await branchPartner();
    await expect(
      submitProduct(partnerId, productInput({ priceTZS })),
    ).resolves.toEqual({ ok: false, reason: "invalid-price" });
  });

  it("refuses a blank required field", async () => {
    const partnerId = await branchPartner();
    await expect(
      submitProduct(partnerId, productInput({ name: "   " })),
    ).resolves.toEqual({ ok: false, reason: "missing-field" });
  });

  it("is not visible as a Product until published", async () => {
    const id = await pendingSubmission();
    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id },
    });
    expect(row.status).toBe("pending");
    expect(row.publishedProductId).toBeNull();
    await expect(
      getPrisma().product.count({ where: { id: `sub-${id}` } }),
    ).resolves.toBe(0);
  });
});

// The rules in `src/lib/product-listing.ts` used to be enforced only by the
// form. A Server Action is a public endpoint, so "only by the form" meant
// "not at all" for anyone who called it directly. Each case below is a value
// the browser would have refused and the server used to store.
describe("submitProduct — runs the same rules as the form", () => {
  const SUPABASE = "https://project.supabase.co";
  const photo = (name: string) =>
    `${SUPABASE}/storage/v1/object/public/product-photos/uid-1/${name}.webp`;

  /** Refused, and nothing was written. */
  async function expectRefused(overrides: Record<string, unknown>, reason: string) {
    const partnerId = await branchPartner();
    const before = await getPrisma().productSubmission.count({ where: { partnerId } });

    await expect(
      submitProduct(partnerId, productInput(overrides) as never),
    ).resolves.toEqual({ ok: false, reason });

    await expect(
      getPrisma().productSubmission.count({ where: { partnerId } }),
    ).resolves.toBe(before);
  }

  beforeAll(() => {
    // The bucket prefix is derived from this, exactly as in production. Set
    // here rather than read from any file: the suite must not depend on what
    // a developer's environment happens to hold.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a description that is too short", async () => {
    await expectRefused({ description: "Nice phone." }, "invalid-description");
  });

  it("refuses a description that is too long", async () => {
    await expectRefused({ description: "x".repeat(801) }, "invalid-description");
  });

  it("refuses thirteen details", async () => {
    const specs = Array.from({ length: 13 }, (_, i) => ({
      key: `Detail ${i + 1}`,
      value: `Value ${i + 1}`,
    }));
    await expectRefused({ specs }, "invalid-specs");
  });

  it("accepts twelve details, the most a listing may carry", async () => {
    const partnerId = await branchPartner();
    const specs = Array.from({ length: 12 }, (_, i) => ({
      key: `Detail ${i + 1}`,
      value: `Value ${i + 1}`,
    }));
    const outcome = await submitProduct(partnerId, productInput({ specs }));
    expect(outcome.ok).toBe(true);
  });

  it("refuses a half-filled detail instead of quietly dropping it", async () => {
    await expectRefused({ specs: [{ key: "Colour", value: "" }] }, "invalid-specs");
  });

  it("refuses a picture key that is not one of ours", async () => {
    await expectRefused({ image: "tractor" }, "invalid-image");
    // The old fixture value: a path, which `ProductIcon` cannot draw.
    await expectRefused({ image: "/images/products/test.svg" }, "invalid-image");
  });

  it("refuses a price past the ceiling", async () => {
    await expectRefused({ priceTZS: 2_000_000_001 }, "invalid-price");
  });

  it("accepts a price exactly at the ceiling", async () => {
    const partnerId = await branchPartner();
    const outcome = await submitProduct(partnerId, productInput({ priceTZS: 2_000_000_000 }));
    expect(outcome.ok).toBe(true);
  });

  it("refuses a photo URL outside our bucket", async () => {
    await expectRefused({ photoUrls: ["https://evil.example/tracker.gif"] }, "invalid-photo");
    // One good photo does not carry a bad one in with it.
    await expectRefused(
      { photoUrls: [photo("front"), "https://evil.example/tracker.gif"] },
      "invalid-photo",
    );
    // Same host, a different bucket.
    await expectRefused(
      { photoUrls: [`${SUPABASE}/storage/v1/object/public/avatars/uid-1/a.webp`] },
      "invalid-photo",
    );
    // The single-photo field from before the gallery is checked the same way.
    await expectRefused({ photoUrl: "https://evil.example/tracker.gif" }, "invalid-photo");
  });

  it("refuses a seventh photo", async () => {
    const photoUrls = Array.from({ length: 7 }, (_, i) => photo(`p${i}`));
    await expectRefused({ photoUrls }, "invalid-photo");
  });

  it("stores a known category in its one spelling", async () => {
    const partnerId = await branchPartner();
    const outcome = await submitProduct(partnerId, productInput({ category: "  phones " }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });
    expect(row.category).toBe("Phones");
  });

  it("stores the photos in order, without repeats, with the first as the main photo", async () => {
    const partnerId = await branchPartner();
    const outcome = await submitProduct(
      partnerId,
      productInput({ photoUrls: [photo("front"), photo("back"), photo("front")] }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });
    expect(row.photoUrls).toEqual([photo("front"), photo("back")]);
    expect(row.photoUrl).toBe(photo("front"));
  });

  it("stores no photos as an empty list and a null main photo", async () => {
    const id = await pendingSubmission();
    const row = await getPrisma().productSubmission.findUniqueOrThrow({ where: { id } });
    expect(row.photoUrls).toEqual([]);
    expect(row.photoUrl).toBeNull();
  });

  it("still accepts the single-photo field an older caller sends", async () => {
    const partnerId = await branchPartner();
    const outcome = await submitProduct(partnerId, productInput({ photoUrl: photo("only") }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });
    expect(row.photoUrls).toEqual([photo("only")]);
    expect(row.photoUrl).toBe(photo("only"));
  });

  it("copies every photo to the live product on publish, main photo first", async () => {
    const partnerId = await branchPartner();
    const submitted = await submitProduct(
      partnerId,
      productInput({ photoUrls: [photo("front"), photo("back"), photo("box")] }),
    );
    if (!submitted.ok) throw new Error(`fixture setup failed: ${submitted.reason}`);

    const published = await publishSubmission(submitted.value.id, "admin-1");
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const product = await getPrisma().product.findUniqueOrThrow({
      where: { id: published.value.productId },
    });
    expect(product.photoUrls).toEqual([photo("front"), photo("back"), photo("box")]);
    expect(product.photoUrl).toBe(photo("front"));

    // And the shop's own read hands the list on.
    const { getProductById } = await import("@/server/repositories");
    const shown = await getProductById(product.id);
    expect(shown?.photoUrls).toEqual([photo("front"), photo("back"), photo("box")]);
    expect(shown?.photoUrl).toBe(photo("front"));
  });

  it("publishes a submission from before the gallery with its one photo as a one-photo list", async () => {
    const id = await pendingSubmission();
    // What a row written before the `photoUrls` column looks like.
    await getPrisma().productSubmission.update({
      where: { id },
      data: { photoUrl: photo("legacy"), photoUrls: [] },
    });

    const published = await publishSubmission(id, "admin-1");
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const product = await getPrisma().product.findUniqueOrThrow({
      where: { id: published.value.productId },
    });
    expect(product.photoUrls).toEqual([photo("legacy")]);
    expect(product.photoUrl).toBe(photo("legacy"));
  });
});

describe("publishSubmission", () => {
  it("writes the live Product row, with its specs, and links it back", async () => {
    const id = await pendingSubmission();
    const outcome = await publishSubmission(id, "admin-1");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const product = await getPrisma().product.findUniqueOrThrow({
      where: { id: outcome.value.productId },
      include: { specs: { orderBy: { position: "asc" } } },
    });
    expect(product.branchId).toBe("toyota-dar");
    expect(product.brandId).toBe("toyota");
    expect(product.priceTZS).toBe(65_000);
    expect(product.specs.map((s) => s.key)).toEqual(["Colour", "Warranty"]);

    const submission = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id },
    });
    expect(submission.status).toBe("published");
    expect(submission.reviewedBy).toBe("admin-1");
    expect(submission.publishedProductId).toBe(product.id);
  });

  it("sorts a published product after the existing catalogue", async () => {
    const id = await pendingSubmission();
    const before = await getPrisma().product.findFirstOrThrow({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const outcome = await publishSubmission(id, "admin-1");
    if (!outcome.ok) throw new Error("expected publish to succeed");

    const product = await getPrisma().product.findUniqueOrThrow({
      where: { id: outcome.value.productId },
    });
    expect(product.sortOrder).toBeGreaterThan(before.sortOrder);
  });

  it("refuses a submission that does not exist", async () => {
    await expect(publishSubmission("no-such-submission", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses to publish twice, and writes no second product", async () => {
    const id = await pendingSubmission();
    const first = await publishSubmission(id, "admin-1");
    expect(first.ok).toBe(true);

    await expect(publishSubmission(id, "admin-2")).resolves.toEqual({
      ok: false,
      reason: "already-reviewed",
    });

    await expect(
      getPrisma().product.count({ where: { id: `sub-${id}` } }),
    ).resolves.toBe(1);
  });

  it("refuses a submission whose partner has no branch", async () => {
    const partnerId = await branchPartner({ branchId: null });
    const outcome = await submitProduct(partnerId, productInput());
    if (!outcome.ok) throw new Error("expected submit to succeed");

    await expect(publishSubmission(outcome.value.id, "admin-1")).resolves.toEqual({
      ok: false,
      reason: "no-branch",
    });
  });

  it("refuses a rejected submission", async () => {
    const id = await pendingSubmission();
    await rejectSubmission(id, "admin-1", "Not a real product");

    await expect(publishSubmission(id, "admin-2")).resolves.toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });

  // The property the guarded write exists for.
  it("two admin tabs both clicking Publish: exactly one wins, exactly one Product", async () => {
    const id = await pendingSubmission();

    const [r1, r2] = await Promise.all([
      publishSubmission(id, "admin-1"),
      publishSubmission(id, "admin-2"),
    ]);

    expect(r1.ok && r2.ok, "both concurrent publishes must never both succeed").toBe(
      false,
    );
    expect(r1.ok || r2.ok, "exactly one of the two must succeed").toBe(true);

    await expect(
      getPrisma().product.count({ where: { id: `sub-${id}` } }),
    ).resolves.toBe(1);

    const submission = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id },
    });
    expect(submission.status).toBe("published");
    expect(["admin-1", "admin-2"]).toContain(submission.reviewedBy);
  });

  it("two admins racing Publish and Reject: exactly one decision lands", async () => {
    const id = await pendingSubmission();

    const [publish, reject] = await Promise.all([
      publishSubmission(id, "admin-1"),
      rejectSubmission(id, "admin-2", "Duplicate listing"),
    ]);

    expect(publish.ok && reject.ok, "publish and reject must never both win").toBe(
      false,
    );
    expect(publish.ok || reject.ok, "exactly one must win").toBe(true);

    const submission = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id },
    });
    const productCount = await getPrisma().product.count({
      where: { id: `sub-${id}` },
    });

    // The row and the world agree: a published submission has a product, a
    // rejected one does not.
    if (submission.status === "published") {
      expect(productCount).toBe(1);
    } else {
      expect(submission.status).toBe("rejected");
      expect(productCount).toBe(0);
    }
  });
});

describe("rejectSubmission", () => {
  it("stores the trimmed note", async () => {
    const id = await pendingSubmission();
    await expect(rejectSubmission(id, "admin-1", "  Not ours  ")).resolves.toEqual({
      ok: true,
    });

    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id },
    });
    expect(row.status).toBe("rejected");
    expect(row.decisionNote).toBe("Not ours");
    expect(row.reviewedBy).toBe("admin-1");
  });

  it("stores no note when the reason was left blank", async () => {
    const id = await pendingSubmission();
    await rejectSubmission(id, "admin-1", "   ");
    const row = await getPrisma().productSubmission.findUniqueOrThrow({
      where: { id },
    });
    expect(row.decisionNote).toBeNull();
  });

  it("distinguishes a missing submission from an already-reviewed one", async () => {
    await expect(rejectSubmission("no-such-id", "admin-1", "x")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });

    const id = await pendingSubmission();
    await rejectSubmission(id, "admin-1", "First");
    await expect(rejectSubmission(id, "admin-2", "Second")).resolves.toEqual({
      ok: false,
      reason: "already-reviewed",
    });
  });
});

describe("a published product survives a re-seed", () => {
  // Measured 2026-08-27, the day publishing landed: the seed's prune deletes
  // any Product not in `src/data`, and a published submission is by definition
  // not in `src/data`. Before the fix this test read before=1, after=0 — a
  // partner's live listing silently removed by a routine `npm run db:setup`,
  // taking the `Order.productId` of anyone who had ordered it along with it.
  //
  // This is the first place the database legitimately holds a row the static
  // arrays have never heard of, which is what reversing debt #8 actually means.
  it("is not pruned by seedDatabase, which only owns records from src/data", async () => {
    const id = await pendingSubmission();
    const published = await publishSubmission(id, "admin-1");
    if (!published.ok) throw new Error("expected publish to succeed");

    const productId = published.value.productId;
    await expect(
      getPrisma().product.count({ where: { id: productId } }),
    ).resolves.toBe(1);

    await seedDatabase(getPrisma());

    await expect(
      getPrisma().product.count({ where: { id: productId } }),
      "a published product must survive a re-seed",
    ).resolves.toBe(1);

    // And its specs came with it — the prune cascades to ProductSpec.
    await expect(
      getPrisma().productSpec.count({ where: { productId } }),
    ).resolves.toBe(2);
  });

  it("still prunes a product that WAS from src/data and has been removed", async () => {
    // The prune's real job must keep working: narrowing its scope must not
    // switch it off.
    await getPrisma().product.create({
      data: {
        id: "stale-editorial-product",
        slug: "stale-editorial-product",
        branchId: "toyota-dar",
        brandId: "toyota",
        name: "Removed from src/data",
        category: "electronics",
        priceTZS: 1_000,
        image: "/x.svg",
        description: "Simulates a product deleted from the editorial arrays.",
        inStock: true,
        sortOrder: 9_999,
      },
    });

    await seedDatabase(getPrisma());

    await expect(
      getPrisma().product.count({ where: { id: "stale-editorial-product" } }),
      "a product no longer in src/data must still be pruned",
    ).resolves.toBe(0);
  });
});
