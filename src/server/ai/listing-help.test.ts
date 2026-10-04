// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildDraftFacts,
  CLEAN_INSTRUCTIONS,
  cleanPhotoBackground,
  draftDescription,
  DRAFT_INSTRUCTIONS,
  DRAFT_MAX_CHARS,
  listingAiFeatures,
  SAME_ITEM_INSTRUCTIONS,
  tidyDraft,
} from "./listing-help";

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
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_GEMINI_TEXT_MODEL", "");
  vi.stubEnv("AI_GEMINI_IMAGE_MODEL", "");
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

  it("the Google key alone switches on both", () => {
    vi.stubEnv("GEMINI_API_KEY", "g");
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

/* ---------- the Google key ---------- */

const GEMINI_TEXT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";
const GEMINI_IMAGE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";

const photoResponse = (type = "image/webp") => new Response(new Blob([new Uint8Array([1, 2, 3])], { type }), { status: 200, headers: { "content-type": type } });
const geminiText = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const geminiImage = (mimeType = "image/png") =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: Buffer.from([7, 7, 7]).toString("base64") } }] } }] }), { status: 200 });

describe("draftDescription with the Google key", () => {
  it("sends the same instructions and facts, the photo inline, and the key in a header only", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    fetchMock.mockResolvedValueOnce(photoResponse()).mockResolvedValueOnce(geminiText(" Sealed black wireless earbuds with a one year shop warranty. "));

    await expect(draftDescription({ ...INPUT, photoUrl: PHOTO })).resolves.toEqual({
      ok: true,
      description: "Sealed black wireless earbuds with a one year shop warranty.",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(PHOTO);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(GEMINI_TEXT);
    expect(url).not.toContain("g-key");
    expect(init.headers["x-goog-api-key"]).toBe("g-key");
    const parts = JSON.parse(init.body).contents[0].parts;
    expect(parts[0].inline_data).toEqual({ mime_type: "image/webp", data: Buffer.from([1, 2, 3]).toString("base64") });
    expect(parts[1].text).toContain("Use ONLY the facts");
    expect(parts[1].text).toContain("One year shop warranty");
  });

  it("is preferred over the older key, and still writes when the photo cannot be read", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    fetchMock.mockResolvedValueOnce(new Response("gone", { status: 404 })).mockResolvedValueOnce(geminiText("A sealed pair of black wireless earbuds."));

    await expect(draftDescription({ ...INPUT, photoUrl: PHOTO })).resolves.toEqual({ ok: true, description: "A sealed pair of black wireless earbuds." });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(GEMINI_TEXT);
    expect(JSON.parse(init.body).contents[0].parts).toHaveLength(1);
  });

  it("reports a refusal, an empty answer or a network error as a failure", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    fetchMock.mockResolvedValueOnce(new Response("quota", { status: 429 }));
    await expect(draftDescription(INPUT)).resolves.toEqual({ ok: false, reason: "provider-failed" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    await expect(draftDescription(INPUT)).resolves.toEqual({ ok: false, reason: "provider-failed" });
    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(draftDescription(INPUT)).resolves.toEqual({ ok: false, reason: "provider-failed" });
  });
});

describe("cleanPhotoBackground with the Google key", () => {
  it("tells the image model to leave the item alone", () => {
    expect(CLEAN_INSTRUCTIONS).toMatch(/only the background changed/);
    expect(CLEAN_INSTRUCTIONS).toMatch(/Do NOT change the product in any way/);
    expect(CLEAN_INSTRUCTIONS).toMatch(/no text, no price/);
    expect(SAME_ITEM_INSTRUCTIONS).toMatch(/you are not sure, answer false/);
  });

  it("still refuses a URL that is not one of this project's product photos", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    await expect(cleanPhotoBackground("https://evil.example/x.jpg")).resolves.toEqual({ ok: false, reason: "invalid-photo" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands back the picture only after a second call confirms the item is unchanged", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    fetchMock
      .mockResolvedValueOnce(photoResponse())
      .mockResolvedValueOnce(geminiImage())
      .mockResolvedValueOnce(geminiText('{"same_item": true, "difference": ""}'));

    await expect(cleanPhotoBackground(PHOTO)).resolves.toEqual({ ok: true, base64: Buffer.from([7, 7, 7]).toString("base64"), contentType: "image/png" });

    const [imageUrl, imageInit] = fetchMock.mock.calls[1];
    expect(imageUrl).toBe(GEMINI_IMAGE);
    const imageBody = JSON.parse(imageInit.body);
    expect(imageBody.generationConfig.responseModalities).toEqual(["IMAGE"]);
    expect(imageBody.contents[0].parts[1].text).toBe(CLEAN_INSTRUCTIONS);

    const [checkUrl, checkInit] = fetchMock.mock.calls[2];
    expect(checkUrl).toBe(GEMINI_TEXT);
    const checkParts = JSON.parse(checkInit.body).contents[0].parts;
    expect(checkParts[0].inline_data.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(checkParts[1].inline_data.data).toBe(Buffer.from([7, 7, 7]).toString("base64"));
  });

  it("throws the picture away when the check says no, is unreadable, or fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    const verdicts = [
      () => geminiText('{"same_item": false, "difference": "logo missing"}'),
      () => geminiText('{"same_item": "true"}'),
      () => geminiText("Yes, they look the same."),
      () => new Response("overloaded", { status: 503 }),
    ];
    for (const verdict of verdicts) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(photoResponse()).mockResolvedValueOnce(geminiImage()).mockResolvedValueOnce(verdict());
      await expect(cleanPhotoBackground(PHOTO)).resolves.toEqual({ ok: false, reason: "not-faithful" });
    }
  });

  it("fails cleanly when no picture comes back, or the original is not an image", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    fetchMock.mockResolvedValueOnce(photoResponse()).mockResolvedValueOnce(geminiText("I cannot edit this image."));
    await expect(cleanPhotoBackground(PHOTO)).resolves.toEqual({ ok: false, reason: "provider-failed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(cleanPhotoBackground(PHOTO)).resolves.toEqual({ ok: false, reason: "invalid-photo" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the cut-out provider instead when its key is present", async () => {
    vi.stubEnv("GEMINI_API_KEY", "g-key");
    vi.stubEnv("PHOTOROOM_API_KEY", "p-key");
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob([new Uint8Array([1])], { type: "image/webp" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    await expect(cleanPhotoBackground(PHOTO)).resolves.toMatchObject({ ok: true, contentType: "image/jpeg" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://sdk.photoroom.com/v1/segment");
  });
});
