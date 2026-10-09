// @vitest-environment node
//
// Real Postgres. A shop's paperwork, attached to its own application and
// nobody else's, and a verdict that is advisory in the database as well as in
// the prose.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { createApplicationForUser } from "./applications";
import {
  missingDocumentsFor,
  recordApplicationDocuments,
  screenApplicationDocuments,
  type UploadedDocument,
} from "./documents";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("partner_documents");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.partnerDocument.deleteMany({});
  await prisma.partnerUser.deleteMany({});
  await prisma.partner.deleteMany({});
  await prisma.partnerApplication.deleteMany({});
  vi.restoreAllMocks();
});

let seq = 0;

/** A plausible phone photo of an A4 licence, well inside the 10 MB ceiling. */
const TYPICAL_SCAN_BYTES = 240_000;
/** Comfortably past it, so the refusal is not a boundary question. */
const OVERSIZED_BYTES = 50 * 1024 * 1024;

/** One pending brand application, with its uid. */
async function application(uid?: string) {
  seq += 1;
  const owner = uid ?? `uid-shop-${seq}-${Date.now()}`;
  const outcome = await createApplicationForUser(owner, `shop${seq}@example.com`, {
    kind: "brand",
    businessName: "Kilimanjaro Motors",
    contactName: "Neema Mushi",
    phone: "0754123456",
    city: "Arusha",
    brandId: "toyota",
    brandOther: "",
    address: "Sokoine Road, Arusha",
    deliveryMode: "split",
    notes: "",
  });
  if (!outcome.submitted) throw new Error(outcome.reason);
  return { id: outcome.id, uid: owner };
}

const upload = (
  uid: string,
  applicationId: string,
  kind: UploadedDocument["kind"],
  overrides: Partial<UploadedDocument> = {},
): UploadedDocument => ({
  kind,
  storagePath: `${uid}/${applicationId}/${kind}-1700000000000.jpg`,
  mimeType: "image/jpeg",
  byteSize: TYPICAL_SCAN_BYTES,
  signedUrl: `https://storage.example/${kind}?token=abc`,
  ...overrides,
});

describe("recordApplicationDocuments", () => {
  it("attaches all three to the applicant's own application", async () => {
    const { id, uid } = await application();

    const outcome = await recordApplicationDocuments(uid, id, [
      upload(uid, id, "licence"),
      upload(uid, id, "tin"),
      upload(uid, id, "shopfront"),
    ]);

    expect(outcome).toEqual({ ok: true, recorded: 3 });
    expect(await missingDocumentsFor(id)).toEqual([]);
  });

  it("names what is still missing", async () => {
    const { id, uid } = await application();
    await recordApplicationDocuments(uid, id, [upload(uid, id, "licence")]);
    expect(await missingDocumentsFor(id)).toEqual(["tin", "shopfront"]);
  });

  it("refuses to attach a document to somebody else's application", async () => {
    const mine = await application();
    const theirs = await application();

    const outcome = await recordApplicationDocuments(
      mine.uid,
      theirs.id,
      [upload(mine.uid, theirs.id, "licence")],
    );

    expect(outcome).toEqual({ ok: false, reason: "not-yours" });
    expect(await getPrisma().partnerDocument.count()).toBe(0);
  });

  it("refuses a storage path under another account's folder", async () => {
    // The attack this exists for: claim the path of a licence somebody else
    // uploaded, and have it attached to your own application.
    const mine = await application();
    const theirs = await application();

    const outcome = await recordApplicationDocuments(mine.uid, mine.id, [
      upload(theirs.uid, theirs.id, "licence"),
    ]);

    expect(outcome).toEqual({ ok: false, reason: "bad-document" });
    expect(await getPrisma().partnerDocument.count()).toBe(0);
  });

  it("refuses a path that climbs out of the folder", async () => {
    const { id, uid } = await application();
    const outcome = await recordApplicationDocuments(uid, id, [
      upload(uid, id, "licence", { storagePath: `${uid}/../elsewhere/licence.jpg` }),
    ]);
    expect(outcome).toEqual({ ok: false, reason: "bad-document" });
  });

  it("refuses a kind nobody asked for", async () => {
    const { id, uid } = await application();
    const outcome = await recordApplicationDocuments(uid, id, [
      { ...upload(uid, id, "licence"), kind: "nida" },
    ]);
    expect(outcome).toEqual({ ok: false, reason: "bad-document" });
  });

  it("refuses a file of the wrong type or past the ceiling", async () => {
    const { id, uid } = await application();
    expect(
      await recordApplicationDocuments(uid, id, [
        upload(uid, id, "licence", { mimeType: "application/msword" }),
      ]),
    ).toEqual({ ok: false, reason: "bad-document" });
    expect(
      await recordApplicationDocuments(uid, id, [
        upload(uid, id, "licence", { byteSize: OVERSIZED_BYTES }),
      ]),
    ).toEqual({ ok: false, reason: "bad-document" });
  });

  it("writes nothing at all when one document in the batch is refused", async () => {
    // All or nothing: a half-attached set would look to the admin like a shop
    // that only sent two of three.
    const { id, uid } = await application();
    const outcome = await recordApplicationDocuments(uid, id, [
      upload(uid, id, "licence"),
      upload(uid, id, "tin", { mimeType: "text/plain" }),
    ]);
    expect(outcome).toEqual({ ok: false, reason: "bad-document" });
    expect(await getPrisma().partnerDocument.count()).toBe(0);
  });

  it("accepts an empty batch without writing anything", async () => {
    // The form can reach here with nothing picked if every upload failed. That
    // is not an error -- the application stands and the admin sees the gap.
    const { id, uid } = await application();
    expect(await recordApplicationDocuments(uid, id, [])).toEqual({ ok: true, recorded: 0 });
    expect(await getPrisma().partnerDocument.count()).toBe(0);
    expect(await missingDocumentsFor(id)).toEqual(["licence", "tin", "shopfront"]);
  });

  it("refuses a document with a missing or empty field rather than storing a blank", async () => {
    const { id, uid } = await application();
    const blanks: Partial<UploadedDocument>[] = [
      { storagePath: "" },
      { mimeType: "" },
      { byteSize: 0 },
      // Cast: a hand-edited payload can send anything, and the point is that
      // these never reach the database.
      { storagePath: undefined as unknown as string },
      { mimeType: null as unknown as string },
      { kind: null as unknown as UploadedDocument["kind"] },
    ];
    for (const override of blanks) {
      expect(
        await recordApplicationDocuments(uid, id, [upload(uid, id, "licence", override)]),
        JSON.stringify(override),
      ).toEqual({ ok: false, reason: "bad-document" });
    }
    expect(await getPrisma().partnerDocument.count()).toBe(0);
  });

  it("refuses an application that does not exist", async () => {
    expect(
      await recordApplicationDocuments("uid-x", "no-such-application", []),
    ).toEqual({ ok: false, reason: "no-application" });
  });

  it("records a double submit of the same upload once", async () => {
    const { id, uid } = await application();
    const once = upload(uid, id, "licence");
    expect(await recordApplicationDocuments(uid, id, [once])).toEqual({ ok: true, recorded: 1 });
    expect(await recordApplicationDocuments(uid, id, [once])).toEqual({ ok: true, recorded: 0 });
    expect(await getPrisma().partnerDocument.count()).toBe(1);
  });

  it("keeps a genuine second attempt beside the first", async () => {
    const { id, uid } = await application();
    await recordApplicationDocuments(uid, id, [
      upload(uid, id, "licence", { storagePath: `${uid}/${id}/licence-1.jpg` }),
    ]);
    await recordApplicationDocuments(uid, id, [
      upload(uid, id, "licence", { storagePath: `${uid}/${id}/licence-2.jpg` }),
    ]);
    expect(await getPrisma().partnerDocument.count()).toBe(2);
  });

  it("takes the documents with the application when it is deleted", async () => {
    const { id, uid } = await application();
    await recordApplicationDocuments(uid, id, [upload(uid, id, "licence")]);
    await getPrisma().partnerApplication.delete({ where: { id } });
    expect(await getPrisma().partnerDocument.count()).toBe(0);
  });
});

describe("screenApplicationDocuments", () => {
  /** Make the reader answer, without reaching Google or Storage. */
  function reader(answer: unknown, options: { fetchFails?: boolean } = {}) {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const url = String(input);
      // The signed URL: the document's bytes.
      if (url.startsWith("https://storage.example/")) {
        if (options.fetchFails) return { ok: false, status: 404 } as unknown as Response;
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: async () => new TextEncoder().encode("bytes").buffer,
        } as unknown as Response;
      }
      // Gemini.
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  /** Not a real key. Its only job is to make `isDocumentCheckConfigured` true. */
  const FAKE_KEY = "test-key";

  const CLEAN = {
    files: [
      { kind: "licence", verdict: "pass", notes: "Name matches." },
      { kind: "tin", verdict: "pass", notes: "TIN matches." },
      { kind: "shopfront", verdict: "pass", notes: "Shop with signage." },
    ],
    summary: "All three agree with the form.",
  };

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });

  async function withDocuments() {
    const { id, uid } = await application();
    const documents = [
      upload(uid, id, "licence"),
      upload(uid, id, "tin"),
      upload(uid, id, "shopfront"),
    ];
    await recordApplicationDocuments(uid, id, documents);
    return { id, uid, documents };
  }

  const row = (id: string) =>
    getPrisma().partnerApplication.findUniqueOrThrow({
      where: { id },
      select: { status: true, aiVerdict: true, aiNotes: true, aiCheckedAt: true },
    });

  it("records the verdict on the application", async () => {
    const { id, documents } = await withDocuments();
    reader(CLEAN);

    expect(await screenApplicationDocuments(id, documents)).toMatchObject({
      ok: true,
      verdict: "pass",
    });

    const after = await row(id);
    expect(after.aiVerdict).toBe("pass");
    expect(after.aiNotes).toBe("All three agree with the form.");
    expect(after.aiCheckedAt).toBeInstanceOf(Date);
  });

  it("does not approve anything, however clean the verdict", async () => {
    // The whole design: a forged licence that reads cleanly must not be able to
    // let itself in. If this test ever fails, that promise has been broken.
    const { id, documents } = await withDocuments();
    reader(CLEAN);

    await screenApplicationDocuments(id, documents);

    expect((await row(id)).status).toBe("pending");
    expect(await getPrisma().partner.count()).toBe(0);
    expect(await getPrisma().partnerUser.count()).toBe(0);
  });

  it("records each document's own line, so the admin knows which file to look at", async () => {
    const { id, documents } = await withDocuments();
    reader({
      files: [
        { kind: "licence", verdict: "pass", notes: "Fine." },
        { kind: "tin", verdict: "concerns", notes: "The TIN differs from the licence." },
        { kind: "shopfront", verdict: "pass", notes: "Fine." },
      ],
      summary: "The TIN does not match.",
    });

    await screenApplicationDocuments(id, documents);

    const tin = await getPrisma().partnerDocument.findFirstOrThrow({
      where: { applicationId: id, kind: "tin" },
      select: { aiVerdict: true, aiNotes: true },
    });
    expect(tin.aiVerdict).toBe("concerns");
    expect(tin.aiNotes).toContain("differs from the licence");
    expect((await row(id)).aiVerdict).toBe("concerns");
  });

  it("leaves no verdict at all when there is no key", async () => {
    const { id, documents } = await withDocuments();
    delete process.env.GEMINI_API_KEY;

    expect(await screenApplicationDocuments(id, documents)).toEqual({
      ok: false,
      reason: "not-configured",
    });
    // Absent must never look like clean.
    expect((await row(id)).aiVerdict).toBeNull();
  });

  it("leaves no verdict when the bytes cannot be fetched", async () => {
    const { id, documents } = await withDocuments();
    reader(CLEAN, { fetchFails: true });

    expect(await screenApplicationDocuments(id, documents)).toEqual({
      ok: false,
      reason: "nothing-to-read",
    });
    expect((await row(id)).aiVerdict).toBeNull();
  });

  it("leaves no verdict when a document has no signed url", async () => {
    const { id, uid } = await withDocuments();
    reader(CLEAN);
    const noLink = [upload(uid, id, "licence", { signedUrl: "" })];

    expect(await screenApplicationDocuments(id, noLink)).toEqual({
      ok: false,
      reason: "nothing-to-read",
    });
    expect((await row(id)).aiVerdict).toBeNull();
  });

  it("leaves no verdict for an application that is gone", async () => {
    reader(CLEAN);
    expect(await screenApplicationDocuments("no-such-application", [])).toEqual({
      ok: false,
      reason: "nothing-to-read",
    });
  });
});
