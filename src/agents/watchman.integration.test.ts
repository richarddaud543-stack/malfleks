// @vitest-environment node
//
// Real Postgres, stubbed network. The watchman's whole value is what it says
// about a database it did not write, so the checks are on its findings and the
// numbers it leaves for its next shift.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { runAgent } from "./runtime";

let db: TestDatabase;
const fetchMock = vi.fn();

beforeAll(async () => {
  db = await createTestDatabase("agent_watchman");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("AGENT_SITE_URL", "https://shop.example");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const prisma = getPrisma();
  await prisma.agentRun.deleteMany({ where: {} });
  await prisma.agentHelpRequest.deleteMany({ where: {} });
  await prisma.serverErrorLog.deleteMany({ where: {} });
});

const allPagesOk = () => fetchMock.mockResolvedValue(new Response("<html></html>", { status: 200 }));

const lastRun = () => getPrisma().agentRun.findFirstOrThrow({ where: { agentKey: "watchman" }, orderBy: { startedAt: "desc" } });

const texts = (findings: unknown) => (Array.isArray(findings) ? findings.map((f) => String((f as { text: string }).text)) : []);

describe("the watchman on a quiet, healthy site", () => {
  it("says so, and writes down what it counted", async () => {
    allPagesOk();
    const outcome = await runAgent("watchman", "schedule");
    expect(outcome.ok).toBe(true);

    const row = await lastRun();
    expect(row.outcome).toBe("ok");
    expect(row.summary).toContain("All quiet");
    expect(texts(row.findings)[0]).toContain("pages answered");

    const metrics = row.metrics as Record<string, number>;
    expect(metrics.pagesDown).toBe(0);
    expect(metrics.pagesChecked).toBe(4);
    expect(typeof metrics.orders).toBe("number");
  });

  it("checks the pages with a real request, at the address it was given", async () => {
    allPagesOk();
    await runAgent("watchman", "schedule");
    const asked = fetchMock.mock.calls.map((call) => String(call[0])).sort();
    expect(asked).toEqual([
      "https://shop.example/",
      "https://shop.example/brands",
      "https://shop.example/how-it-works",
      "https://shop.example/search",
    ]);
  });
});

describe("the watchman when something is wrong", () => {
  it("reports a page that does not answer, and asks for attention", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/search") ? Promise.resolve(new Response("boom", { status: 500 })) : Promise.resolve(new Response("ok", { status: 200 })),
    );

    await runAgent("watchman", "schedule");
    const row = await lastRun();
    expect(row.outcome).toBe("attention");
    expect(texts(row.findings).some((text) => text.includes("/search did not answer (500)"))).toBe(true);
    expect((row.metrics as Record<string, number>).pagesDown).toBe(1);
  });

  it("treats a network failure as the page being down rather than crashing the shift", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    await runAgent("watchman", "schedule");

    const row = await lastRun();
    // Down, not errored: the shift did its job and found the site unreachable.
    expect(row.outcome).toBe("attention");
    expect(row.summary).toContain("the shop is down");
    expect((row.metrics as Record<string, number>).pagesDown).toBe(4);
  });

  it("counts the day's errors and the photos the same-item check threw away", async () => {
    allPagesOk();
    const prisma = getPrisma();
    await prisma.serverErrorLog.createMany({
      data: [
        { context: "ai-clean-photo", message: "rejected: the item did not match" },
        { context: "ai-clean-photo", message: "rejected: the item did not match" },
        { context: "submit-order", message: "something else" },
      ],
    });

    await runAgent("watchman", "schedule");
    const row = await lastRun();
    const metrics = row.metrics as Record<string, number>;
    expect(metrics.errors24h).toBe(3);
    expect(metrics.rejectedPhotos).toBe(2);
    expect(texts(row.findings).some((text) => text.includes("2 cleaned photos were rejected"))).toBe(true);
  });
});

describe("what the watchman never does", () => {
  it("changes nothing but its own shift record", async () => {
    allPagesOk();
    const prisma = getPrisma();
    const before = await Promise.all([prisma.order.count(), prisma.product.count(), prisma.partner.count(), prisma.orderPayment.count()]);

    await runAgent("watchman", "schedule");

    const after = await Promise.all([prisma.order.count(), prisma.product.count(), prisma.partner.count(), prisma.orderPayment.count()]);
    expect(after).toEqual(before);
  });

  it("asks about the refund rule once, and only when money is actually being held", async () => {
    allPagesOk();
    await runAgent("watchman", "schedule");
    expect(await getPrisma().agentHelpRequest.count()).toBe(0);
  });
});
