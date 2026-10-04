// @vitest-environment node
//
// Real Postgres. What matters about the harness is what ends up in the
// archive, so that is what is checked -- not the calls it made to get there.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { askOwner, lessonsFor, readFindings, readMetrics, runAgent, setPaused, setRank, CITY_KEY } from "./runtime";
import type { Agent, AgentShift } from "./types";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("agent_runtime");
  vi.spyOn(registry, "agentByKey").mockImplementation((key: string) => (current && key === current.key ? current : undefined));
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

afterEach(async () => {
  const prisma = getPrisma();
  await prisma.agentRun.deleteMany({ where: {} });
  await prisma.agentLesson.deleteMany({ where: {} });
  await prisma.agentHelpRequest.deleteMany({ where: {} });
  await prisma.agentState.deleteMany({ where: {} });
});

/** A stand-in resident, so these tests are about the harness and not the watchman's checks. */
const fake = (over: Partial<Agent> = {}): Agent => ({
  key: "tester",
  name: "The tester",
  office: "Testing",
  job: "Exists so the harness can be checked.",
  reads: ["Nothing"],
  writes: [],
  boundary: "Reports only.",
  needsModel: false,
  curriculum: ["promise", "city"],
  defaultRank: "employed",
  run: async (shift: AgentShift) => {
    shift.note("info", "looked around");
    return { outcome: "ok", summary: "nothing to report", metrics: { seen: 1 } };
  },
  ...over,
});

import * as registry from "./registry";

/**
 * The registry is code, so a test resident is injected by taking over the
 * lookup -- once, in `beforeAll`.
 *
 * Spying again mid-test installed a spy wrapping the spy, and the lookup began
 * answering `undefined`: every later shift then resolved to the default rank of
 * a non-existent agent, skipped as "still at school", and the test stayed green
 * on the assertions it had already passed. So `live()` only swaps which agent
 * the one installed lookup answers with.
 */
let current: Agent | null = null;

function live(agent: Agent) {
  current = agent;
}

const lastRun = async (agentKey = "tester") =>
  getPrisma().agentRun.findFirstOrThrow({ where: { agentKey }, orderBy: { startedAt: "desc" } });

describe("a shift that works", () => {
  it("records what it found, its numbers and how long it took", async () => {
    live(fake());
    const outcome = await runAgent("tester", "manual");
    expect(outcome.ok).toBe(true);

    const row = await lastRun();
    expect(row.outcome).toBe("ok");
    expect(row.summary).toBe("nothing to report");
    expect(row.trigger).toBe("manual");
    expect(readFindings(row.findings)).toEqual([{ level: "info", text: "looked around" }]);
    expect(readMetrics(row.metrics)).toEqual({ seen: 1 });
    expect(row.finishedAt.getTime()).toBeGreaterThanOrEqual(row.startedAt.getTime());
  });

  it("is given the handbook sections it studies, and the lessons it was taught", async () => {
    const seen: { handbook: string; lessons: string[] } = { handbook: "", lessons: [] };
    live(
      fake({
        run: async (shift) => {
          seen.handbook = shift.handbook;
          seen.lessons = shift.lessons.map((lesson) => lesson.title);
          return { outcome: "ok", summary: "read up", metrics: {} };
        },
      }),
    );
    await getPrisma().agentLesson.createMany({
      data: [
        { agentKey: "tester", title: "Mine", body: "b", source: "owner" },
        { agentKey: null, title: "Everyone's", body: "b", source: "owner" },
        { agentKey: "someone-else", title: "Not mine", body: "b", source: "owner" },
        { agentKey: "tester", title: "Retired", body: "b", source: "owner", active: false },
      ],
    });

    await runAgent("tester", "manual");
    expect(seen.handbook).toContain("What MalFleks is");
    expect(seen.handbook).toContain("Pesa yako inalindwa");
    // Only the sections in its curriculum.
    expect(seen.handbook).not.toContain("What may never be said");
    expect(seen.lessons.sort()).toEqual(["Everyone's", "Mine"]);
  });
});

describe("the archive is written whatever happens", () => {
  it("records a crash as an error rather than throwing at the caller", async () => {
    live(fake({ run: async () => { throw new Error("the database went away"); } }));
    const outcome = await runAgent("tester", "schedule");

    expect(outcome.ok).toBe(true);
    const row = await lastRun();
    expect(row.outcome).toBe("error");
    expect(row.summary).toContain("the database went away");
  });

  it("records a skipped shift for a paused agent, and for the whole city", async () => {
    live(fake());
    await setPaused("tester", true);
    await runAgent("tester", "schedule");
    expect((await lastRun()).outcome).toBe("skipped");

    await setPaused("tester", false);
    await setPaused(CITY_KEY, true);
    await runAgent("tester", "schedule");
    const row = await lastRun();
    expect(row.outcome).toBe("skipped");
    expect(row.summary).toContain("Paused");
  });

  it("will not let a student work", async () => {
    live(fake({ run: async () => { throw new Error("a student must never run"); } }));
    await setRank("tester", "student");
    await runAgent("tester", "schedule");

    const row = await lastRun();
    expect(row.outcome).toBe("skipped");
    expect(row.summary).toContain("school");
  });

  it("refuses a name nobody in the city answers to, and writes nothing", async () => {
    live(fake());
    await expect(runAgent("nobody", "manual")).resolves.toEqual({ ok: false, reason: "unknown-agent" });
    expect(await getPrisma().agentRun.count()).toBe(0);
  });
});

describe("memory between shifts", () => {
  it("hands the next shift the numbers the last working one wrote, and ignores skipped and failed ones", async () => {
    const seen: (Record<string, unknown> | null)[] = [];
    const agent = fake({
      run: async (shift) => {
        seen.push(shift.previous);
        return { outcome: "ok", summary: "counted", metrics: { orders: seen.length * 10 } };
      },
    });
    live(agent);

    await runAgent("tester", "schedule");
    await runAgent("tester", "schedule");

    // A skip and a crash in between must not become "the world looked empty".
    await setPaused("tester", true);
    await runAgent("tester", "schedule");
    await setPaused("tester", false);
    live(fake({ run: async () => { throw new Error("boom"); } }));
    await runAgent("tester", "schedule");

    live(agent);
    await runAgent("tester", "schedule");

    const archive = await getPrisma().agentRun.findMany({ orderBy: { startedAt: "asc" }, select: { outcome: true, metrics: true } });
    expect(archive.map((row) => row.outcome)).toEqual(["ok", "ok", "skipped", "error", "ok"]);
    expect(seen).toEqual([null, { orders: 10 }, { orders: 20 }]);
  });

  it("drops anything from the stored numbers that is not a flat value", async () => {
    expect(readMetrics({ a: 1, b: "two", c: true, d: null, e: { nested: 1 }, f: [1] })).toEqual({ a: 1, b: "two", c: true, d: null });
    expect(readMetrics(null)).toEqual({});
    expect(readMetrics([1, 2])).toEqual({});
  });
});

describe("the help desk", () => {
  it("asks once, ever — answered or dismissed does not reopen it", async () => {
    await expect(askOwner("tester", "refund-rule", "What is the rule?", "context")).resolves.toBe(true);
    await expect(askOwner("tester", "refund-rule", "Asked again, worded differently", undefined)).resolves.toBe(false);

    const prisma = getPrisma();
    expect(await prisma.agentHelpRequest.count()).toBe(1);

    await prisma.agentHelpRequest.updateMany({ where: { topic: "refund-rule" }, data: { status: "dismissed" } });
    await expect(askOwner("tester", "refund-rule", "Surely now?", undefined)).resolves.toBe(false);
    expect(await prisma.agentHelpRequest.count()).toBe(1);

    // A different agent's question about the same thing is its own.
    await expect(askOwner("someone-else", "refund-rule", "What is the rule?", undefined)).resolves.toBe(true);
  });

  it("lets an agent ask from inside a shift", async () => {
    live(
      fake({
        run: async (shift) => {
          const filed = await shift.ask("a-topic", "A question?", "while looking at X");
          return { outcome: "attention", summary: filed ? "asked" : "already asked", metrics: {} };
        },
      }),
    );

    await runAgent("tester", "schedule");
    expect((await lastRun()).summary).toBe("asked");
    await runAgent("tester", "schedule");
    expect((await lastRun()).summary).toBe("already asked");
    expect(await getPrisma().agentHelpRequest.count()).toBe(1);
  });
});

describe("standing", () => {
  it("starts at the rank the roster gives it, and remembers a change", async () => {

    const seen: string[] = [];
    live(
      fake({
        defaultRank: "trainee",
        run: async (shift) => {
          seen.push(shift.rank);
          return { outcome: "ok", summary: "ok", metrics: {} };
        },
      }),
    );

    await runAgent("tester", "manual");
    await setRank("tester", "employed");
    await runAgent("tester", "manual");
    expect(seen).toEqual(["trainee", "employed"]);
  });

  it("teaches an agent its own lessons and everybody's, newest first", async () => {
    const prisma = getPrisma();
    await prisma.agentLesson.create({ data: { agentKey: null, title: "Older", body: "b", source: "owner" } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.agentLesson.create({ data: { agentKey: "tester", title: "Newer", body: "b", source: "owner" } });

    const lessons = await lessonsFor("tester");
    expect(lessons.map((lesson) => lesson.title)).toEqual(["Newer", "Older"]);
    expect(lessons.map((lesson) => lesson.everyone)).toEqual([false, true]);
  });
});
