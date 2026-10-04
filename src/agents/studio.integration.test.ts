// @vitest-environment node
//
// Real Postgres, stubbed provider. These two agents hand their work back to the
// seller who asked for it, so what is checked is both halves: what the seller
// gets, and what the archive keeps.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/server/db/client";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { runAgent, setPaused, setRank } from "./runtime";
import { lessonBlock } from "./studio";

let db: TestDatabase;
const fetchMock = vi.fn();

const SUPABASE = "https://nnrcjeowivnbzdkwxxrm.supabase.co";
const PHOTO = `${SUPABASE}/storage/v1/object/public/product-photos/uid-1/a.webp`;

beforeAll(async () => {
  db = await createTestDatabase("agent_studio");
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("GEMINI_API_KEY", "g-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("PHOTOROOM_API_KEY", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  const prisma = getPrisma();
  await prisma.agentRun.deleteMany({ where: {} });
  await prisma.agentLesson.deleteMany({ where: {} });
  await prisma.agentState.deleteMany({ where: {} });
});

const photoResponse = () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), { status: 200, headers: { "content-type": "image/webp" } });
const geminiText = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const geminiImage = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from([7, 7, 7]).toString("base64") } }] } }] }), { status: 200 });

const lastRun = (agentKey: string) => getPrisma().agentRun.findFirstOrThrow({ where: { agentKey }, orderBy: { startedAt: "desc" } });

const DRAFT_WORK = {
  name: "Oraimo FreePods 4",
  category: "Audio",
  notes: "New, sealed box. One year shop warranty.",
  specs: [{ key: "Colour", value: "Black" }],
  photoUrl: null,
};

describe("the photo studio", () => {
  it("hands the cleaned photo back and records that the item was unchanged", async () => {
    fetchMock.mockResolvedValueOnce(photoResponse()).mockResolvedValueOnce(geminiImage()).mockResolvedValueOnce(geminiText('{"same_item": true}'));

    const shift = await runAgent("photo-studio", "event", { input: { photoUrl: PHOTO } });
    expect(shift.ok && (shift.data as { ok: boolean; contentType: string })).toMatchObject({ ok: true, contentType: "image/png" });

    const row = await lastRun("photo-studio");
    expect(row.outcome).toBe("ok");
    expect(row.trigger).toBe("event");
    expect(row.metrics).toMatchObject({ cleaned: 1, rejected: 0 });
    // The photo itself must not be in the archive.
    expect(JSON.stringify(row)).not.toContain(Buffer.from([7, 7, 7]).toString("base64"));
  });

  it("records a thrown-away photo as something the owner should see", async () => {
    fetchMock.mockResolvedValueOnce(photoResponse()).mockResolvedValueOnce(geminiImage()).mockResolvedValueOnce(geminiText('{"same_item": false, "difference": "logo gone"}'));

    const shift = await runAgent("photo-studio", "event", { input: { photoUrl: PHOTO } });
    expect(shift.ok && (shift.data as { reason: string }).reason).toBe("not-faithful");

    const row = await lastRun("photo-studio");
    expect(row.outcome).toBe("attention");
    expect(row.summary).toContain("Threw away");
    expect(row.metrics).toMatchObject({ cleaned: 0, rejected: 1 });
  });

  it("passes the owner's lessons to the model, after the rules", async () => {
    await getPrisma().agentLesson.create({
      data: { agentKey: "photo-studio", title: "Keep the shadow", body: "A soft shadow under the item looks real. Never remove it.", source: "owner" },
    });
    fetchMock.mockResolvedValueOnce(photoResponse()).mockResolvedValueOnce(geminiImage()).mockResolvedValueOnce(geminiText('{"same_item": true}'));

    await runAgent("photo-studio", "event", { input: { photoUrl: PHOTO } });

    const prompt = JSON.parse(fetchMock.mock.calls[1][1].body).contents[0].parts[1].text as string;
    expect(prompt).toContain("Do NOT change the product in any way");
    expect(prompt).toContain("Keep the shadow: A soft shadow under the item looks real");
    expect(prompt.indexOf("Do NOT change the product")).toBeLessThan(prompt.indexOf("Keep the shadow"));
  });

  it("does nothing, and spends nothing, when a clock wakes it", async () => {
    await runAgent("photo-studio", "schedule");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await lastRun("photo-studio")).metrics).toMatchObject({ cleaned: 0 });
  });

  it("stops entirely when the owner pauses it or sends it back to school", async () => {
    await setPaused("photo-studio", true);
    let shift = await runAgent("photo-studio", "event", { input: { photoUrl: PHOTO } });
    expect(shift.ok && shift.run.outcome).toBe("skipped");
    expect(shift.ok && shift.data).toBeUndefined();

    await setPaused("photo-studio", false);
    await setRank("photo-studio", "student");
    shift = await runAgent("photo-studio", "event", { input: { photoUrl: PHOTO } });
    expect(shift.ok && shift.run.outcome).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the catalogue writer", () => {
  it("hands the draft back and keeps only its length in the archive", async () => {
    fetchMock.mockResolvedValueOnce(geminiText("Sealed black wireless earbuds with a one year shop warranty."));

    const shift = await runAgent("catalogue-writer", "event", { input: DRAFT_WORK });
    expect(shift.ok && (shift.data as { description: string }).description).toBe("Sealed black wireless earbuds with a one year shop warranty.");

    const row = await lastRun("catalogue-writer");
    expect(row.outcome).toBe("ok");
    expect(row.summary).toContain("Oraimo FreePods 4");
    expect(row.metrics).toMatchObject({ drafted: 1, characters: 60, hadPhoto: false });
    expect(JSON.stringify(row.metrics)).not.toContain("Sealed black");
  });

  it("treats refusing to write from a name alone as the right answer, not a failure", async () => {
    const shift = await runAgent("catalogue-writer", "event", { input: { ...DRAFT_WORK, notes: "", specs: [] } });
    expect(shift.ok && (shift.data as { reason: string }).reason).toBe("not-enough");

    const row = await lastRun("catalogue-writer");
    expect(row.outcome).toBe("ok");
    expect(row.metrics).toMatchObject({ drafted: 0, refused: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is taught by the owner too", async () => {
    await getPrisma().agentLesson.create({
      data: { agentKey: null, title: "Our customers", body: "Most buyers read on a phone in Swahili or English. Keep sentences short.", source: "owner" },
    });
    fetchMock.mockResolvedValueOnce(geminiText("A sealed pair of black wireless earbuds."));

    await runAgent("catalogue-writer", "event", { input: DRAFT_WORK });
    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text as string;
    expect(prompt).toContain("Use ONLY the facts");
    expect(prompt).toContain("Our customers: Most buyers read on a phone");
  });
});

describe("what a lesson may not do", () => {
  it("is added after the rules and framed as subordinate to them", () => {
    const block = lessonBlock([{ id: "1", title: "T", body: "B", everyone: false }]);
    expect(block).toContain("Follow it unless it would mean inventing something or changing the product");
    expect(lessonBlock([])).toBe("");
  });
});
