// @vitest-environment node
//
// Real Postgres; email is mocked. What is being proved: "Verified shop" is
// only ever true of a shop whose three documents a person at MalFleks has
// read -- at approval when they came with the application, or later with
// "Documents checked" -- and every reader of that fact (the product page's
// mark, the partner page, the console) agrees.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("@/server/notify/email", async (original) => ({
  ...(await original<typeof import("@/server/notify/email")>()),
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));
vi.mock("@/server/revalidate-public-site", () => ({ notifyPublicSiteOfCatalogueChange: vi.fn() }));

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { approveApplication } from "./review";
import {
  DOCUMENTS_ARRIVED_ALERT_KEY,
  isVerifiedShop,
  markDocumentsChecked,
  partnerDocumentsView,
  tellOwnerDocumentsArrived,
} from "./verification";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("shop_verification");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.ownerAlert.deleteMany({});
  await prisma.partner.deleteMany({});
  await prisma.partnerApplication.deleteMany({});
  sendNotification.mockReset().mockResolvedValue({ sent: true });
});

let n = 0;
async function application(kind: "brand" | "courier", documents: string[]) {
  n += 1;
  const uid = `uid-verify-${n}`;
  const row = await getPrisma().partnerApplication.create({
    data: { kind, status: "pending", uid, email: `shop${n}@example.test`, businessName: `Shop ${n}`, contactName: "Juma", phone: "+255754000111", city: "Dar es Salaam" },
    select: { id: true },
  });
  for (const kind of documents) {
    await getPrisma().partnerDocument.create({
      data: { applicationId: row.id, uid, kind, storagePath: `${uid}/${row.id}/${kind}.pdf`, mimeType: "application/pdf", byteSize: 1000 },
    });
  }
  return { applicationId: row.id, uid };
}

async function approved(kind: "brand" | "courier", documents: string[]) {
  const app = await application(kind, documents);
  expect(await approveApplication(app.applicationId, "admin-1")).toEqual({ ok: true });
  const partner = await getPrisma().partner.findUniqueOrThrow({ where: { applicationId: app.applicationId } });
  return { ...app, partner };
}

describe("approving a shop", () => {
  it("verifies it when the application came with all three documents", async () => {
    const { partner } = await approved("brand", ["licence", "tin", "shopfront"]);
    expect(partner.documentsVerifiedAt).toBeInstanceOf(Date);
    expect(partner.documentsVerifiedBy).toBe("admin-1");
  });

  it("does not, when any one is missing", async () => {
    const { partner } = await approved("brand", ["licence", "tin"]);
    expect(partner.documentsVerifiedAt).toBeNull();
  });

  it("verifies a rider who applied with their driving licence", async () => {
    const { partner } = await approved("courier", ["driving"]);
    expect(partner.documentsVerifiedAt).toBeInstanceOf(Date);
  });

  it("does not verify a rider without one -- a shop's papers are not a driving licence", async () => {
    const { partner } = await approved("courier", ["licence", "tin", "shopfront"]);
    expect(partner.documentsVerifiedAt).toBeNull();
    expect(await markDocumentsChecked(partner.id, "admin-1")).toEqual({ ok: false, reason: "documents-missing" });
  });
});

describe("a shop sending its documents after approval", () => {
  it("tells the owner once, and says which are still missing", async () => {
    const { partner, applicationId, uid } = await approved("brand", []);
    await getPrisma().partnerDocument.create({
      data: { applicationId, uid, kind: "licence", storagePath: `${uid}/${applicationId}/licence-late.pdf`, mimeType: "application/pdf", byteSize: 1000 },
    });

    expect(await tellOwnerDocumentsArrived(applicationId)).toBe(true);
    expect(await tellOwnerDocumentsArrived(applicationId)).toBe(false);

    const alerts = await getPrisma().ownerAlert.findMany({ where: { key: DOCUMENTS_ARRIVED_ALERT_KEY } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toMatch(/Still missing: tin, shopfront/);
    expect(alerts[0].href).toBe(`/admin/partners/${partner.id}`);
  });

  it("does not bother the owner about an application still in the review queue, or a shop already verified", async () => {
    const pending = await application("brand", ["licence"]);
    expect(await tellOwnerDocumentsArrived(pending.applicationId)).toBe(false);

    const { applicationId } = await approved("brand", ["licence", "tin", "shopfront"]);
    expect(await tellOwnerDocumentsArrived(applicationId)).toBe(false);
  });
});

describe("Documents checked", () => {
  it("needs all three, records who, closes the owner's alerts, and happens once", async () => {
    const { partner, applicationId, uid } = await approved("brand", ["licence"]);
    expect(await markDocumentsChecked(partner.id, "admin-2")).toEqual({ ok: false, reason: "documents-missing" });

    for (const kind of ["tin", "shopfront"]) {
      await getPrisma().partnerDocument.create({
        data: { applicationId, uid, kind, storagePath: `${uid}/${applicationId}/${kind}-late.pdf`, mimeType: "application/pdf", byteSize: 1000 },
      });
    }
    await tellOwnerDocumentsArrived(applicationId);

    expect(await markDocumentsChecked(partner.id, "admin-2")).toEqual({ ok: true, restored: 0 });
    expect(await markDocumentsChecked(partner.id, "admin-2")).toEqual({ ok: false, reason: "already-verified" });

    const after = await getPrisma().partner.findUniqueOrThrow({ where: { id: partner.id } });
    expect(after.documentsVerifiedBy).toBe("admin-2");
    expect((await getPrisma().ownerAlert.findMany({ where: { key: DOCUMENTS_ARRIVED_ALERT_KEY } })).map((a) => a.status)).toEqual(["resolved"]);
  });

  it("refuses a partner that does not exist", async () => {
    expect(await markDocumentsChecked("no-such-partner", "admin-1")).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("what customers and the shop are shown", () => {
  it("shows the mark only for an active, verified shop on the map", async () => {
    const verified = await approved("brand", ["licence", "tin", "shopfront"]);
    const unverified = await approved("brand", []);
    await getPrisma().partner.update({ where: { id: verified.partner.id }, data: { branchId: "toyota-dar" } });
    await getPrisma().partner.update({ where: { id: unverified.partner.id }, data: { branchId: "toyota-arusha" } });

    expect(await isVerifiedShop("toyota-dar")).toBe(true);
    expect(await isVerifiedShop("toyota-arusha")).toBe(false);

    // Suspended: no longer vouched for.
    await getPrisma().partner.update({ where: { id: verified.partner.id }, data: { status: "suspended" } });
    expect(await isVerifiedShop("toyota-dar")).toBe(false);
  });

  it("tells the shop what it has sent and what it still owes", async () => {
    const { partner } = await approved("brand", ["tin"]);
    const view = await partnerDocumentsView(partner.id);
    expect(view).toMatchObject({ verifiedAt: null, received: ["tin"], missing: ["licence", "shopfront"], deadline: null, hidden: false });

    const rider = await approved("courier", []);
    expect(await partnerDocumentsView(rider.partner.id)).toMatchObject({ kind: "courier", verifiedAt: null, received: [], missing: ["driving"] });
  });

  it("lets a rider send their licence later, tells the owner, and can then be checked", async () => {
    const { partner, applicationId, uid } = await approved("courier", []);
    await getPrisma().partnerDocument.create({
      data: { applicationId, uid, kind: "driving", storagePath: `${uid}/${applicationId}/driving-late.jpg`, mimeType: "image/jpeg", byteSize: 1000 },
    });
    expect(await tellOwnerDocumentsArrived(applicationId)).toBe(true);
    const [alert] = await getPrisma().ownerAlert.findMany({ where: { key: DOCUMENTS_ARRIVED_ALERT_KEY } });
    expect(alert.body).toMatch(/driving licence is there/);
    expect(alert.body).toMatch(/delivery routing/);

    expect(await markDocumentsChecked(partner.id, "admin-1")).toEqual({ ok: true, restored: 0 });
    expect((await getPrisma().ownerAlert.findUniqueOrThrow({ where: { id: alert.id } })).status).toBe("resolved");
  });
});
