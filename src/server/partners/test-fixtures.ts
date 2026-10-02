import { getPrisma } from "@/server/db/client";

/**
 * A partner, the way approval and activation leave one, for integration
 * suites that need "the partner who owns this branch" without walking the
 * whole apply → approve → activate loop (`loop.integration.test.ts` already
 * proves that path). Test-only: nothing in `src/app` imports this.
 *
 * It writes the same three rows the real flow does -- the application (which
 * is where a partner's email address lives), the `Partner`, and the
 * `PartnerUser` binding the uid to it -- so code that resolves a partner from
 * a session, or an address from a partner, runs against the real shape.
 */
export async function createTestPartner(input: {
  uid: string;
  email: string;
  kind?: "brand" | "courier";
  displayName?: string;
  branchId?: string | null;
  agentId?: string | null;
  status?: "active" | "suspended";
}): Promise<{ partnerId: string; applicationId: string }> {
  const db = getPrisma();
  const kind = input.kind ?? "brand";
  const displayName = input.displayName ?? (kind === "courier" ? "Test Couriers" : "Test Branch");

  const application = await db.partnerApplication.create({
    data: {
      kind,
      status: "approved",
      uid: input.uid,
      email: input.email,
      businessName: displayName,
      contactName: "Asha Mwenda",
      phone: "+255754123456",
      city: "Dar es Salaam",
      reviewedAt: new Date(),
      reviewedBy: "admin-fixture",
    },
    select: { id: true },
  });

  const partner = await db.partner.create({
    data: {
      kind,
      status: input.status ?? "active",
      displayName,
      contactName: "Asha Mwenda",
      phone: "+255754123456",
      city: "Dar es Salaam",
      branchId: input.branchId ?? null,
      agentId: input.agentId ?? null,
      applicationId: application.id,
      approvedBy: "admin-fixture",
      users: { create: { uid: input.uid } },
    },
    select: { id: true },
  });

  return { partnerId: partner.id, applicationId: application.id };
}
