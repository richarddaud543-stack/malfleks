// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildDraftFacts, cleanPhotoBackground, draftDescription, DRAFT_INSTRUCTIONS, DRAFT_MAX_CHARS, listingAiFeatures, tidyDraft } from "./listing-help";

const SUPABASE = "https://proj.supabase.co";
const PHOTO = `${SUPABASE}/storage/v1/object/public/product-photos/uid-1/a.webp`;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("PHOTOROOM_API_KEY", "");
  vi.stubEnv("AI_LISTING_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const INPUT = {
  name: "Oraimo FreePods 4",
  category: "Audio",
  notes: "New, sealed box. One year shop warranty.",
  specs: [{ key: "Colour", value: "Black" }],
  photoUrl: null as string | null,
};

describe("listingAiFeatures", () => {
  it("is all off with no keys, and each key switches on only its own helper", () => {
    expect(listingAiFeatures()).toEqual({ describe: false, cleanPhoto: false });
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect(listingAiFeatures()).toEqual({ describe: true, cleanPhoto: false });
    vi.stubEnv("PHOTOROOM_API_KEY", "k");
    expect(listingAiFeatures()).toEqual({ describe: true, cleanPhoto: true });
  });
});

describe("the draft's instructions", () => {
  it("forbid inventing anything about the item", () => {
    expect(DRAFT_INSTRUCTIONS).toMatch(/Use ONLY the facts/);
    expect(DRAFT_INSTRUCTIONS).toMatch(/Do not add any specification/);
    expect(DRAFT_INSTRUCTIONS).toMatch(/Never guess a model or a specification from a photo/);
  });

  it("pass on exactly what the partner typed, bounded", () => {
    const facts = buildDraftFacts({ ...INPUT, notes: "x".repeat(5000) });
    expect(facts).toContain("Product name: Oraimo FreePods 4");
    expect(facts).toContain("Colour: Black");
    expect(facts.length).toBeLessThan(1200);
  });
});

describe("tidyDraft", () => {
  it("strips wrapping quotes and never returns more than the form accepts", () => {
    expect(tidyDraft('"A sealed pair of earbuds."')).toBe("A sealed pair of earbuds.");
    const long = `${"A true sentence about the item. ".repeat(60)}`;
    const tidy = tidyDraft(long);
    expect(tidy.length).toBeLessThanOrEqual(DRAFT_MAX_CHARS);
    expect(tidy.endsWith(".")).toBe(true);
  });
});

describe("draftDescription", () => {
  it("does nothing without a key", async () => {
    await expect(draftDescription(INPUT)).resolves.toEqual({ ok: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to write from a name alone rather than pad it out", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    await expect(draftDescription({ ...INPUT, notes: "", specs: [] })).resolves.toEqual({ ok: false, reason: "not-enough" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the facts and the photo, and returns the tidied draft", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: " Sealed black wireless earbuds with a one year shop warranty. " }] }), { status: 200 }));

    await expect(draftDescription({ ...INPUT, photoUrl: PHOTO })).resolves.toEqual({
      ok: true,
      description: "Sealed black wireless earbuds with a one year shop warranty.",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.messages[0].content[0]).toEqual({ type: "image", source: { type: "url", url: PHOTO } });
    expect(body.messages[0].content[1].text).toContain("One year shop warranty");
  });

  it("reports a provider failure instead of throwing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    fetchMock.mockResolvedValue(new Response("overloaded", { status: 529 }));
    await expect(draftDescription(INPUT)).resolves.toEqual({ ok: false, reason: "provider-failed" });
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(draftDescription(INPUT)).resolves.toEqual({ ok: false, reason: "provider-failed" });
  });
});

describe("cleanPhotoBackground", () => {
  it("does nothing without a key", async () => {
    await expect(cleanPhotoBackground(PHOTO)).resolves.toEqual({ ok: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("will not fetch a URL that is not one of this project's product photos", async () => {
    vi.stubEnv("PHOTOROOM_API_KEY", "k");
    for (const url of ["https://evil.example/x.jpg", "http://169.254.169.254/latest/meta-data", `${SUPABASE}/storage/v1/object/public/other-bucket/a.jpg`, ""]) {
      await expect(cleanPhotoBackground(url)).resolves.toEqual({ ok: false, reason: "invalid-photo" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a white background and nothing else, and hands back the image", async () => {
    vi.stubEnv("PHOTOROOM_API_KEY", "k");
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 9]), { status: 200, headers: { "content-type": "image/jpeg" } }));

    const outcome = await cleanPhotoBackground(PHOTO);
    expect(outcome).toEqual({ ok: true, base64: Buffer.from([9, 9]).toString("base64"), contentType: "image/jpeg" });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://sdk.photoroom.com/v1/segment");
    const form = init.body as FormData;
    expect([...form.keys()].sort()).toEqual(["bg_color", "format", "image_file"]);
    expect(form.get("bg_color")).toBe("white");
  });

  it("treats a non-image answer as a failure", async () => {
    vi.stubEnv("PHOTOROOM_API_KEY", "k");
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array([1])]), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await expect(cleanPhotoBackground(PHOTO)).resolves.toEqual({ ok: false, reason: "provider-failed" });
  });
});
