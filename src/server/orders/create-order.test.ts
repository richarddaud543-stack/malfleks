// @vitest-environment node
//
// A real SQLite database built from the committed migration, same pattern as
// `repositories.test.ts`. Nothing is mocked: the point is to prove a written
// row is correct, that a reference collision actually retries against the
// database's own unique constraint, and that deleting a branch or agent an
// order points at nulls the reference rather than touching the order — the
// property the schema's `onDelete: SetNull` columns exist for.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma, resetPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createOrder } from "./create-order";
import type { SaveOrderRequestInput } from "./build-order-request";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const PRISMA_CLI = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");

let workDir: string;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "soko-order-test-"));
  const databaseUrl = `file:${path.join(workDir, "test.db").replaceAll("\\", "/")}`;

  process.env.DATABASE_URL = databaseUrl;
  await resetPrisma();

  if (!existsSync(PRISMA_CLI)) {
    throw new Error(
      `Prisma CLI not found at ${PRISMA_CLI}. Run "npm install" before the test suite.`
    );
  }

  execFileSync(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await resetPrisma();
  rmSync(workDir, { recursive: true, force: true });
});

// Same fixtures `saved-requests.test.ts` uses, and for the same reason: real
// catalogue records, not stand-ins that could drift from what they claim to
// test. BRAND_DELIVERED/toyota-corolla is reserved for the tests that assert
// on written rows; AGENT_ROUTED/toyota-hilux is reserved for the final
// cascade test, which deletes its branch and agent outright and would
// otherwise pull the rug out from under any test that runs after it.
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
    reference: "",
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("createOrder — writing a row", () => {
  it("writes a row matching the rebuilt order request", async () => {
    const outcome = await createOrder(input({ quantity: "3" }), "uid-asha");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.value.status).toBe("pending");
    expect(outcome.value.createdAt).toBeInstanceOf(Date);

    const row = await getPrisma().order.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });

    expect(row.customerId).toBe("uid-asha");
    expect(row.productId).toBe(BRAND_DELIVERED);
    expect(row.productName).toBe("Toyota Corolla");
    expect(row.unitPriceTZS).toBeGreaterThan(0);
    expect(row.brandId).toBe("toyota");
    expect(row.brandSlug).toBe("toyota");
    expect(row.branchId).toBe("toyota-dar");
    expect(row.branchCity).toBe("Dar es Salaam");
    expect(row.routeKind).toBe("brand");
    expect(row.routeCarrier).toContain("Toyota");
    expect(row.agentId).toBeNull();
    expect(row.quantity).toBe(3);
    expect(row.lineTotalTZS).toBe(row.unitPriceTZS * 3);
    expect(row.customerFullName).toBe("Asha Mwenda");
    // Normalized by the shared validator, same as every other persistence path.
    expect(row.customerPhone).toBe("+255754123456");
    expect(row.status).toBe("pending");
    expect(row.reference).toMatch(/^TOY-DAR-[A-Z0-9]{4}$/);
  });

  it("persists customerId: null for a signed-out customer", async () => {
    const outcome = await createOrder(input(), null);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const row = await getPrisma().order.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });
    expect(row.customerId).toBeNull();
  });

  it("records the chosen agent and its snapshot fields on an agent route", async () => {
    const outcome = await createOrder(
      input({ productId: AGENT_ROUTED, agentId: AGENT_IN_ARUSHA }),
      null
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const row = await getPrisma().order.findUniqueOrThrow({
      where: { id: outcome.value.id },
    });
    expect(row.routeKind).toBe("agent");
    expect(row.agentId).toBe(AGENT_IN_ARUSHA);
    expect(row.routeCarrier).toBe("Fargo Courier");
    expect(row.routeAgentPhone).toBeTruthy();
    expect(row.routeEtaEstimate).toBeTruthy();
  });

  it("regenerates and retries once on a reference collision", async () => {
    const REF = "TOY-DAR-K7M4";

    const first = await createOrder(input({ reference: REF }), null);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.reference).toBe(REF);

    // Same reference again — the unique constraint fires, and the retry
    // regenerates rather than failing the request over a cosmetic collision.
    const second = await createOrder(
      input({ reference: REF, fullName: "Second Customer" }),
      null
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.reference).not.toBe(REF);
    expect(second.value.reference).toMatch(/^TOY-DAR-[A-Z0-9]{4}$/);

    // Both rows exist, distinct references, same brand+city prefix.
    const rows = await getPrisma().order.findMany({
      where: { customerFullName: { in: ["Asha Mwenda", "Second Customer"] } },
    });
    const references = new Set(rows.map((r) => r.reference));
    expect(references.size).toBe(rows.length);
  });
});

describe("createOrder — the same failure cases buildOrderRequest already rejects", () => {
  it("rejects an unknown product", async () => {
    await expect(createOrder(input({ productId: "not-a-product" }), null)).resolves.toEqual({
      ok: false,
      reason: "unknown-product",
    });
  });

  it("rejects a product that cannot be ordered at all", async () => {
    await expect(createOrder(input({ productId: OUT_OF_STOCK }), null)).resolves.toEqual({
      ok: false,
      reason: "not-orderable",
    });
  });

  it("rejects invalid customer details", async () => {
    await expect(createOrder(input({ phone: "0222110000" }), null)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(createOrder(input({ quantity: "0" }), null)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects an agent that does not serve the branch's city", async () => {
    await expect(
      createOrder(
        input({ productId: AGENT_ROUTED, agentId: "an-agent-that-does-not-exist" }),
        null
      )
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});

describe("createOrder — deleting the catalogue never deletes the order", () => {
  it("nulls productId/branchId/agentId instead of orphaning the order", async () => {
    const prisma = getPrisma();

    const outcome = await createOrder(
      input({
        productId: AGENT_ROUTED,
        agentId: AGENT_IN_ARUSHA,
        reference: "",
        fullName: "Cascade Check",
      }),
      "uid-cascade"
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const orderId = outcome.value.id;

    // Deleting the agent directly: onDelete: SetNull on Order.agentId.
    await prisma.deliveryAgent.delete({ where: { id: AGENT_IN_ARUSHA } });

    let row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row).not.toBeNull();
    expect(row.agentId).toBeNull();
    // The snapshot survives even though the reference is gone.
    expect(row.routeCarrier).toBe("Fargo Courier");

    // Deleting the branch: it cascades to the product (Branch -> Product is
    // unchanged, still Cascade), and both the branch's own reference on the
    // order and the now-cascaded product's reference resolve to
    // onDelete: SetNull rather than deleting the order transitively.
    await prisma.branch.delete({ where: { id: "toyota-arusha" } });

    row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row).not.toBeNull();
    expect(row.branchId).toBeNull();
    expect(row.productId).toBeNull();
    // Snapshot fields are untouched — this is still a receipt of what the
    // customer saw, not something silently rewritten by the deletion.
    expect(row.branchName).toBe("Toyota Tanzania — Arusha");
    expect(row.productName).toBe("Toyota Hilux");
    expect(row.customerFullName).toBe("Cascade Check");

    // The product itself is really gone (cascaded from the branch), not just
    // unlinked — confirms this is testing the cascade, not a no-op delete.
    await expect(
      prisma.product.findUnique({ where: { id: AGENT_ROUTED } })
    ).resolves.toBeNull();
  });
});
