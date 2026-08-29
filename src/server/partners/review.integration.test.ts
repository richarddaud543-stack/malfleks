// @vitest-environment node
//
// Runs against a real Postgres schema built from the committed migrations.
// Mocking Prisma here would prove nothing: the property under test is that the
// *database* refuses a second decision, and a mock would simply return whatever
// it was told to.
//
// This file exists because of a specific defect found in review (Vault,
// 2026-08-23): approve and reject both read the row, checked its status, then
// wrote by id. Two admins on the same application could each pass the check,
// and the loser's write landed anyway — leaving an application marked
// "rejected" while the applicant held a working partner account. The pure
// `canApprove` tests could never have caught it, because the bug lived in the
// gap between the read and the write.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { approveApplication, rejectApplication } from "./review";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("partner_review");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(async () => {
  const db = getPrisma();
  await db.partnerUser.deleteMany();
  await db.partner.deleteMany();
  await db.partnerApplication.deleteMany();
});

let seq = 0;
async function pendingApplication(uid = `uid-${++seq}`) {
  return getPrisma().partnerApplication.create({
    data: {
      kind: "courier",
      uid,
      email: `${uid}@example.com`,
      businessName: "Arusha Swift Couriers",
      contactName: "Asha Mwenda",
      phone: "+255754123456",
      city: "Arusha",
    },
    select: { id: true, uid: true },
  });
}

describe("approve and reject are one decision, not two writes", () => {
  it("approves a pending application and binds the account to a partner", async () => {
    const application = await pendingApplication();

    await expect(approveApplication(application.id, "admin-1")).resolves.toEqual({
      ok: true,
    });

    const db = getPrisma();
    const partner = await db.partner.findUnique({
      where: { applicationId: application.id },
    });
    expect(partner).not.toBeNull();
    expect(partner?.approvedBy).toBe("admin-1");

    const partnerUser = await db.partnerUser.findUnique({
      where: { uid: application.uid },
    });
    expect(partnerUser?.partnerId).toBe(partner?.id);

    const after = await db.partnerApplication.findUnique({
      where: { id: application.id },
    });
    expect(after?.status).toBe("approved");
    expect(after?.reviewedAt).not.toBeNull();
  });

  it("will not approve an application that was already rejected", async () => {
    // The exact defect. Reject lands first; approve must refuse and — the part
    // that actually mattered — must leave no Partner behind.
    const application = await pendingApplication();
    await rejectApplication(application.id, "admin-1", "Could not verify the shop");

    await expect(approveApplication(application.id, "admin-2")).resolves.toEqual({
      ok: false,
      reason: "already-reviewed",
    });

    const db = getPrisma();
    expect(await db.partner.count()).toBe(0);
    expect(await db.partnerUser.count()).toBe(0);

    const after = await db.partnerApplication.findUnique({
      where: { id: application.id },
    });
    expect(after?.status).toBe("rejected");
    expect(after?.decisionNote).toBe("Could not verify the shop");
    expect(after?.reviewedBy).toBe("admin-1");
  });

  it("will not reject an application that was already approved", async () => {
    const application = await pendingApplication();
    await approveApplication(application.id, "admin-1");

    await expect(
      rejectApplication(application.id, "admin-2", "changed my mind")
    ).resolves.toEqual({ ok: false, reason: "already-reviewed" });

    const db = getPrisma();
    const after = await db.partnerApplication.findUnique({
      where: { id: application.id },
    });
    // The approval stands: reviewer, status and note are the first decision's.
    expect(after?.status).toBe("approved");
    expect(after?.reviewedBy).toBe("admin-1");
    expect(after?.decisionNote).toBeNull();
    expect(await db.partner.count()).toBe(1);
  });

  it("rolls the whole approval back rather than leaving a half-made partner", async () => {
    // Two applications, one account. The second approval must fail on
    // PartnerUser.uid and take its own Partner row down with it — a Partner
    // with no user is a partner nobody can sign in as.
    const first = await pendingApplication("shared-uid");
    const second = await getPrisma().partnerApplication.create({
      data: {
        kind: "brand",
        uid: "shared-uid",
        email: "shared-uid@example.com",
        businessName: "Toyota Arusha",
        contactName: "Asha Mwenda",
        phone: "+255754123456",
        city: "Arusha",
        brandId: "toyota",
        address: "Sokoine Road",
      },
      select: { id: true },
    });

    await expect(approveApplication(first.id, "admin-1")).resolves.toEqual({
      ok: true,
    });
    await expect(approveApplication(second.id, "admin-1")).resolves.toEqual({
      ok: false,
      reason: "account-already-partnered",
    });

    const db = getPrisma();
    expect(await db.partner.count()).toBe(1);
    expect(await db.partnerUser.count()).toBe(1);
    expect(
      (await db.partnerApplication.findUnique({ where: { id: second.id } }))?.status
    ).toBe("pending");
  });

  it("reports a missing application without inventing one", async () => {
    await expect(approveApplication("no-such-id", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    await expect(
      rejectApplication("no-such-id", "admin-1", "")
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });

  it("stores no note when the reason was left blank", async () => {
    const application = await pendingApplication();
    await rejectApplication(application.id, "admin-1", "   ");

    const after = await getPrisma().partnerApplication.findUnique({
      where: { id: application.id },
    });
    expect(after?.decisionNote).toBeNull();
  });

  // Every case above calls the two functions one at a time, `await`ing the
  // first before starting the second. That proves a *second, later* decision
  // is refused — a real property, but not the one the security fix was for.
  // The original defect needed two admins' calls to genuinely interleave: both
  // reads landing before either write. Sequential calls never produce that,
  // because by the time the second call's own pre-check runs, the first
  // call's write has already landed and the row is no longer "pending" — the
  // buggy pre-fix code passes every test above for exactly that reason.
  // Verified by hand against a reconstruction of the pre-fix implementation
  // (read-then-write by id, no status in the WHERE): it passed every
  // sequential case above unchanged, and only failed once called with
  // `Promise.all` the way the two cases below call the real functions. Do not
  // delete these two — they are the ones that actually exercise the race.
  it("a truly concurrent approve and reject on the same application: exactly one wins, never both", async () => {
    const application = await pendingApplication();

    const [approveResult, rejectResult] = await Promise.all([
      approveApplication(application.id, "admin-1"),
      rejectApplication(application.id, "admin-2", "concurrent reject"),
    ]);

    expect(
      approveResult.ok && rejectResult.ok,
      "both a concurrent approve and reject must never both succeed"
    ).toBe(false);

    const db = getPrisma();
    const after = await db.partnerApplication.findUnique({
      where: { id: application.id },
    });

    if (approveResult.ok) {
      expect(after?.status).toBe("approved");
      expect(await db.partner.count()).toBe(1);
      expect(await db.partnerUser.count()).toBe(1);
    } else {
      expect(rejectResult.ok).toBe(true);
      expect(after?.status).toBe("rejected");
      expect(await db.partner.count()).toBe(0);
      expect(await db.partnerUser.count()).toBe(0);
    }
  });

  it("two truly concurrent approvals of the same application: exactly one wins, one Partner row", async () => {
    const application = await pendingApplication();

    const [r1, r2] = await Promise.all([
      approveApplication(application.id, "admin-1"),
      approveApplication(application.id, "admin-2"),
    ]);

    expect(
      r1.ok && r2.ok,
      "both concurrent approvals must never both succeed"
    ).toBe(false);

    const db = getPrisma();
    expect(await db.partner.count()).toBe(1);
    expect(await db.partnerUser.count()).toBe(1);
  });
});
