import { getPrisma } from "@/server/db/client";
import { payeeTotals } from "@/server/money/payouts";
import { toPayoutPhone } from "@/server/money/payout-rules";

/**
 * Partners and brands for the console.
 *
 * A *partner* is an approved account (a branch or a courier). A *brand* is a
 * catalogue row that branches sit under. They are different things: a brand
 * can have branches nobody has claimed yet (researched catalogue data), and a
 * partner exists before it is wired to any branch ("approved, not yet live").
 */

export interface PartnerRow {
  id: string;
  kind: string;
  status: string;
  displayName: string;
  contactName: string;
  phone: string;
  city: string;
  approvedAt: Date;
  live: boolean;
  /** "Toyota · Mikocheni branch" or "Courier · Swift Riders" */
  wiredTo: string | null;
  users: number;
  orders: number;
  ordersDelivered: number;
  owedTZS: number;
  paidTZS: number;
  products: number;
}

export async function listPartners(): Promise<PartnerRow[]> {
  const db = getPrisma();
  const partners = await db.partner.findMany({
    orderBy: [{ status: "asc" }, { approvedAt: "desc" }],
    include: { _count: { select: { users: true } } },
  });

  const branchIds = partners.map((p) => p.branchId).filter((x): x is string => Boolean(x));
  const agentIds = partners.map((p) => p.agentId).filter((x): x is string => Boolean(x));

  const [branches, agents, byBranch, byAgent, deliveredBranch, deliveredAgent, productCounts] = await Promise.all([
    db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true, brand: { select: { name: true } } } }),
    db.deliveryAgent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
    db.order.groupBy({ by: ["branchId"], where: { branchId: { in: branchIds } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["branchId"], where: { branchId: { in: branchIds }, status: "fulfilled" }, _count: { _all: true } }),
    db.order.groupBy({ by: ["agentId"], where: { agentId: { in: agentIds }, status: "fulfilled" }, _count: { _all: true } }),
    db.product.groupBy({ by: ["branchId"], where: { branchId: { in: branchIds } }, _count: { _all: true } }),
  ]);

  const totals = await Promise.all(
    partners.map((p) =>
      p.branchId
        ? payeeTotals({ payeeType: "branch", payeeId: p.branchId }, db)
        : p.agentId
          ? payeeTotals({ payeeType: "agent", payeeId: p.agentId }, db)
          : Promise.resolve({ owedTZS: 0, paidTZS: 0, inPayoutsTZS: 0 }),
    ),
  );

  return partners.map((p, i) => {
    const branch = branches.find((b) => b.id === p.branchId);
    const agent = agents.find((a) => a.id === p.agentId);
    const count = (rows: { _count: { _all: number }; branchId?: string | null; agentId?: string | null }[], key: "branchId" | "agentId", id: string | null) =>
      id ? (rows.find((r) => r[key] === id)?._count._all ?? 0) : 0;
    return {
      id: p.id,
      kind: p.kind,
      status: p.status,
      displayName: p.displayName,
      contactName: p.contactName,
      phone: p.phone,
      city: p.city,
      approvedAt: p.approvedAt,
      live: Boolean(p.branchId || p.agentId),
      wiredTo: branch ? `${branch.brand.name} · ${branch.name}` : agent ? `Courier · ${agent.name}` : null,
      users: p._count.users,
      orders: p.branchId ? count(byBranch, "branchId", p.branchId) : count(byAgent, "agentId", p.agentId),
      ordersDelivered: p.branchId ? count(deliveredBranch, "branchId", p.branchId) : count(deliveredAgent, "agentId", p.agentId),
      owedTZS: totals[i].owedTZS + totals[i].inPayoutsTZS,
      paidTZS: totals[i].paidTZS,
      products: p.branchId ? (productCounts.find((c) => c.branchId === p.branchId)?._count._all ?? 0) : 0,
    };
  });
}

export interface BrandRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  branches: number;
  verifiedBranches: number;
  products: number;
  hiddenProducts: number;
  orders: number;
  partners: number;
}

export async function listBrands(): Promise<BrandRow[]> {
  const db = getPrisma();
  const [brands, verified, hidden, partners] = await Promise.all([
    db.brand.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, name: true, category: true, _count: { select: { branches: true, products: true, orders: true } } },
    }),
    db.branch.groupBy({ by: ["brandId"], where: { verified: true }, _count: { _all: true } }),
    db.product.groupBy({ by: ["brandId"], where: { hiddenAt: { not: null } }, _count: { _all: true } }),
    // Counted through the branch a partner is wired to, not `Partner.brandId`:
    // that is only what they *claimed* on their application, and is null for
    // a brand that was created at go-live.
    db.partner.findMany({ where: { kind: "brand", branchId: { not: null } }, select: { branchId: true } }),
  ]);
  const wiredBranches = partners.length
    ? await db.branch.findMany({ where: { id: { in: partners.map((p) => p.branchId!) } }, select: { brandId: true } })
    : [];
  return brands.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    category: b.category,
    branches: b._count.branches,
    verifiedBranches: verified.find((v) => v.brandId === b.id)?._count._all ?? 0,
    products: b._count.products,
    hiddenProducts: hidden.find((h) => h.brandId === b.id)?._count._all ?? 0,
    orders: b._count.orders,
    partners: wiredBranches.filter((w) => w.brandId === b.id).length,
  }));
}

export async function getPartnerDetail(id: string) {
  const db = getPrisma();
  const partner = await db.partner.findUnique({
    where: { id },
    include: { users: { orderBy: { createdAt: "asc" } } },
  });
  if (!partner) return null;

  const [application, branch, agent] = await Promise.all([
    db.partnerApplication.findUnique({ where: { id: partner.applicationId } }),
    partner.branchId
      ? db.branch.findUnique({
          where: { id: partner.branchId },
          include: { brand: { select: { name: true, slug: true } }, _count: { select: { products: true } } },
        })
      : null,
    partner.agentId
      ? db.deliveryAgent.findUnique({ where: { id: partner.agentId }, include: { regionsServed: { orderBy: { position: "asc" } } } })
      : null,
  ]);

  const orderWhere = partner.branchId ? { branchId: partner.branchId } : partner.agentId ? { agentId: partner.agentId } : null;
  const payee = partner.branchId
    ? ({ payeeType: "branch", payeeId: partner.branchId } as const)
    : partner.agentId
      ? ({ payeeType: "agent", payeeId: partner.agentId } as const)
      : null;

  const [orders, statusGroups, products, submissions, totals, batches] = await Promise.all([
    orderWhere
      ? db.order.findMany({
          where: orderWhere,
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { id: true, reference: true, status: true, createdAt: true, productName: true, quantity: true, lineTotalTZS: true, customerFullName: true },
        })
      : [],
    orderWhere ? db.order.groupBy({ by: ["status"], where: orderWhere, _count: { _all: true } }) : [],
    partner.branchId
      ? db.product.findMany({
          where: { branchId: partner.branchId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, slug: true, name: true, priceTZS: true, inStock: true, hiddenAt: true },
        })
      : [],
    db.productSubmission.groupBy({ by: ["status"], where: { partnerId: partner.id }, _count: { _all: true } }),
    payee ? payeeTotals(payee, db) : null,
    payee
      ? db.payoutBatch.findMany({
          where: { payeeType: payee.payeeType, payeeId: payee.payeeId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, totalTZS: true, status: true, createdAt: true, paidAt: true, providerRef: true },
        })
      : [],
  ]);

  const statusCounts: Record<string, number> = {};
  for (const g of statusGroups) statusCounts[g.status] = g._count._all;
  const submissionCounts: Record<string, number> = {};
  for (const g of submissions) submissionCounts[g.status] = g._count._all;

  return {
    partner,
    payoutPhone: toPayoutPhone(partner.phone),
    application,
    branch,
    agent,
    orders,
    statusCounts,
    products,
    submissionCounts,
    totals,
    batches,
  };
}

export type PartnerDetail = NonNullable<Awaited<ReturnType<typeof getPartnerDetail>>>;

export type PartnerStatusOutcome = { ok: true } | { ok: false; reason: "not-found" | "no-change" | "note-required" };

/**
 * Suspend or reactivate a partner. What suspension does is what the rest of
 * the code already does with `status !== "active"`: the partner can still
 * sign in and see their page, but cannot submit products or be put on the
 * map. It does **not** take their branch or products off the shop — that is
 * a separate, deliberate step from the catalogue, so one click can't make a
 * whole branch vanish for customers.
 *
 * Guarded on the current status, so two tabs can't both "win".
 */
export async function setPartnerStatus(
  partnerId: string,
  status: "active" | "suspended",
  note: string,
  adminUid: string,
): Promise<PartnerStatusOutcome> {
  const trimmed = note.trim();
  if (status === "suspended" && trimmed === "") return { ok: false, reason: "note-required" };

  const db = getPrisma();
  const exists = await db.partner.findUnique({ where: { id: partnerId }, select: { status: true } });
  if (!exists) return { ok: false, reason: "not-found" };

  const { count } = await db.partner.updateMany({
    where: { id: partnerId, status: { not: status } },
    data: { status, statusChangedAt: new Date(), statusChangedBy: adminUid, statusNote: trimmed || null },
  });
  return count === 1 ? { ok: true } : { ok: false, reason: "no-change" };
}
