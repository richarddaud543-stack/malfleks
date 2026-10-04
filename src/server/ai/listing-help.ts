import { isValidProductPhotoUrl } from "@/lib/product-photo";

/**
 * Optional AI help for a partner writing a listing.
 *
 * Two things, each switched on only by a key being present in the
 * environment -- with no key the buttons are not drawn and nothing here is
 * ever called, so the site behaves exactly as it did before 3 Oct 2026:
 *
 *  - "Help me write this": a draft description from the facts the partner
 *    typed (and the main photo, if there is one).
 *  - "Clean background": the same photo with what is behind the item replaced
 *    by plain white.
 *
 * `GEMINI_API_KEY` (added 4 Oct 2026) switches on both. The two older keys
 * still work: `ANTHROPIC_API_KEY` writes the draft when there is no Google
 * key, and `PHOTOROOM_API_KEY`, when present, is preferred for the photo
 * because it cuts the item out rather than redrawing the picture.
 *
 * ## The rule both keep: nothing about the item is invented
 *
 * A marketplace listing is a statement about a real object, and Tanzania's
 * Fair Competition Act treats a false statement of quality, grade or newness
 * as misleading conduct whoever wrote the sentence. So:
 *
 *  - The description is drafted **only** from what the partner supplied. The
 *    prompt forbids adding a spec, a condition, a warranty or an accessory
 *    that was not given, and says to write less rather than fill gaps. The
 *    draft is then *shown* to the partner, who must press "Use this" -- it is
 *    never written into the form on its own, and MalFleks still reviews the
 *    listing before it is published.
 *  - The photo step removes the background and does nothing else. Photoroom's
 *    segmentation endpoint leaves the item's own pixels alone. Google's image
 *    model is generative: it redraws the whole picture, and can change the
 *    item while doing so. So its answer is not trusted. A second model call
 *    (`sameItem`) is shown the original and the result and must say they are
 *    the same object, unchanged, before the result is handed back; anything
 *    else -- "no", a malformed answer, a failed call -- throws the result
 *    away. The partner's original photo stays in the listing beside the
 *    cleaned one either way.
 *
 * Neither provider's response is trusted further than its shape: the draft is
 * trimmed and capped to the same length the validator enforces, and the image
 * is only handed back to the browser, which re-encodes and uploads it through
 * the same path as any other photo.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PHOTOROOM_URL = "https://sdk.photoroom.com/v1/segment";
/**
 * `generateContent`, not the newer Interactions API: that one keeps every
 * request on Google's side by default (55 days on the paid tier), and a
 * partner's photo has no reason to be kept anywhere but here.
 */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3.5-flash";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

/** Overridable without a deploy, because model names are retired on a schedule the code does not control. */
const DEFAULT_MODEL = "claude-sonnet-5-5";

/** The validator's own ceiling; a draft longer than this could not be submitted anyway. */
export const DRAFT_MAX_CHARS = 800;

const TIMEOUT_MS = 25_000;
/** Drawing a picture is slower than cutting one out. */
const IMAGE_TIMEOUT_MS = 45_000;
/** A photo sent inline to a model. The uploader shrinks photos far below this. */
const MAX_INLINE_PHOTO_BYTES = 6 * 1024 * 1024;
/** A cleaned 1600px JPEG is a few hundred KB; a PNG from the image model can be a few MB. Anything far past that is not what was asked for. */
const MAX_CLEANED_BYTES = 6 * 1024 * 1024;

function key(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export interface ListingAiFeatures {
  describe: boolean;
  cleanPhoto: boolean;
}

/** Which helpers this deployment has keys for. Presence only -- the values never leave the server. */
export function listingAiFeatures(): ListingAiFeatures {
  const google = key("GEMINI_API_KEY") !== null;
  return { describe: google || key("ANTHROPIC_API_KEY") !== null, cleanPhoto: google || key("PHOTOROOM_API_KEY") !== null };
}

/* ---------- Google ---------- */

interface InlineImage {
  mimeType: string;
  /** base64 */
  data: string;
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

interface GeminiAnswer {
  text: string;
  image: InlineImage | null;
}

const asPart = (image: InlineImage): GeminiPart => ({ inline_data: { mime_type: image.mimeType, data: image.data } });

/**
 * One stateless call. Returns null on any failure -- a refusal, a block, a
 * non-200, a timeout -- because every caller treats those the same way.
 * The key travels in a header, never in the URL, so it cannot end up in a log.
 */
async function askGemini(
  apiKey: string,
  model: string,
  parts: GeminiPart[],
  generationConfig: Record<string, unknown>,
  timeoutMs: number,
): Promise<GeminiAnswer | null> {
  const response = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: unknown; inlineData?: { mimeType?: unknown; data?: unknown } }[] } }[];
  };
  const answer: GeminiAnswer = { text: "", image: null };
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (typeof part.text === "string") answer.text += part.text;
    const inline = part.inlineData;
    if (!answer.image && inline && typeof inline.data === "string" && typeof inline.mimeType === "string") {
      answer.image = { mimeType: inline.mimeType, data: inline.data };
    }
  }
  return answer;
}

/** One of this project's own photos, as bytes a model can be sent. Null if it cannot be read or is not an image. */
async function loadPhoto(photoUrl: string): Promise<InlineImage | null> {
  const response = await fetch(photoUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_PHOTO_BYTES) return null;
  return { mimeType, data: bytes.toString("base64") };
}

export interface DraftInput {
  name: string;
  category: string;
  /** Whatever the partner has typed so far, possibly nothing. */
  notes: string;
  specs: { key: string; value: string }[];
  /** The main photo, already checked to be in this project's bucket, or null. */
  photoUrl: string | null;
}

export type DraftOutcome =
  | { ok: true; description: string }
  | { ok: false; reason: "not-configured" | "not-enough" | "provider-failed" };

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * The instructions. Kept as one exported string so the test can hold the
 * sentences that matter -- the ones that stop it inventing things.
 */
export const DRAFT_INSTRUCTIONS = [
  "You help a shopkeeper in Tanzania write the description for one product listing on a marketplace.",
  "Write in plain, simple English that a customer reading on a phone understands at once. No sales hype, no exclamation marks, no emoji, no headings, no bullet symbols.",
  "Use ONLY the facts the shopkeeper gave you below. Do not add any specification, size, capacity, model year, condition (new or used), warranty, accessory, origin or claim that was not given. If a photo is attached you may mention only what is plainly visible in it: the kind of item and its colour. Never guess a model or a specification from a photo.",
  "If the facts are thin, write a short description. A short true description is correct; a longer one padded with guesses is wrong.",
  "Do not mention price, delivery, MalFleks, or the shop's name.",
  `Write between 2 and 5 short sentences, at most ${DRAFT_MAX_CHARS - 100} characters in total. Reply with the description text only, nothing before or after it.`,
].join("\n");

export function buildDraftFacts(input: DraftInput): string {
  const lines = [`Product name: ${clip(input.name, 120)}`];
  if (input.category.trim()) lines.push(`Category: ${clip(input.category, 60)}`);
  for (const spec of input.specs.slice(0, 12)) {
    const k = clip(spec.key, 40);
    const v = clip(spec.value, 80);
    if (k && v) lines.push(`${k}: ${v}`);
  }
  if (input.notes.trim()) lines.push(`The shopkeeper's own notes: ${clip(input.notes, 800)}`);
  return lines.join("\n");
}

/** Cut at the last full sentence that fits, so a capped draft never ends mid-word. */
export function tidyDraft(raw: string): string {
  const text = raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().replace(/^["“]|["”]$/g, "");
  if (text.length <= DRAFT_MAX_CHARS) return text;
  const cut = text.slice(0, DRAFT_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (end > 200 ? cut.slice(0, end + 1) : cut).trim();
}

/**
 * Extra instructions from the owner, added to what the model is told.
 *
 * It arrives from the school (`AgentLesson`) by way of the agent, never from a
 * browser, and it is appended *after* the rules -- which forbid inventing a
 * fact and changing the product -- so a lesson can add to them but is read in
 * their light, not instead of them.
 */
export interface HelpOptions {
  extraInstructions?: string;
}

export async function draftDescription(input: DraftInput, options: HelpOptions = {}): Promise<DraftOutcome> {
  const googleKey = key("GEMINI_API_KEY");
  const apiKey = key("ANTHROPIC_API_KEY");
  if (!googleKey && !apiKey) return { ok: false, reason: "not-configured" };
  // A name alone is not something to write about; say so rather than pay for padding.
  const hasSomething = input.notes.trim().length >= 10 || input.specs.some((s) => s.key.trim() && s.value.trim()) || input.photoUrl !== null;
  if (input.name.trim().length < 2 || !hasSomething) return { ok: false, reason: "not-enough" };

  if (googleKey) return draftWithGemini(googleKey, input, options);
  if (!apiKey) return { ok: false, reason: "not-configured" };

  const content: unknown[] = [];
  if (input.photoUrl) content.push({ type: "image", source: { type: "url", url: input.photoUrl } });
  content.push({ type: "text", text: `${DRAFT_INSTRUCTIONS}${options.extraInstructions ?? ""}\n\nFacts:\n${buildDraftFacts(input)}` });

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: key("AI_LISTING_MODEL") ?? DEFAULT_MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: "provider-failed" };

    const data = (await response.json()) as { content?: { type?: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");
    const description = tidyDraft(text);
    return description.length >= 20 ? { ok: true, description } : { ok: false, reason: "provider-failed" };
  } catch {
    return { ok: false, reason: "provider-failed" };
  }
}

async function draftWithGemini(apiKey: string, input: DraftInput, options: HelpOptions): Promise<DraftOutcome> {
  try {
    const parts: GeminiPart[] = [];
    // The photo is a help, not a requirement: a draft from the typed facts alone is still a true draft.
    const photo = input.photoUrl ? await loadPhoto(input.photoUrl).catch(() => null) : null;
    if (photo) parts.push(asPart(photo));
    parts.push({ text: `${DRAFT_INSTRUCTIONS}${options.extraInstructions ?? ""}\n\nFacts:\n${buildDraftFacts(input)}` });

    const answer = await askGemini(apiKey, key("AI_GEMINI_TEXT_MODEL") ?? DEFAULT_GEMINI_TEXT_MODEL, parts, { maxOutputTokens: 2000, temperature: 0.4 }, TIMEOUT_MS);
    const description = tidyDraft(answer?.text ?? "");
    return description.length >= 20 ? { ok: true, description } : { ok: false, reason: "provider-failed" };
  } catch {
    return { ok: false, reason: "provider-failed" };
  }
}

export type CleanedContentType = "image/jpeg" | "image/png" | "image/webp";

export type CleanPhotoOutcome =
  | { ok: true; base64: string; contentType: CleanedContentType }
  | { ok: false; reason: "not-configured" | "invalid-photo" | "provider-failed" | "not-faithful" };

/**
 * What the image model is told. Exported so the test can hold the sentences
 * that matter: the item is not to be touched.
 */
export const CLEAN_INSTRUCTIONS = [
  "This is a shopkeeper's photo of one product for a marketplace listing. Return the same photo with only the background changed.",
  "Replace everything behind and around the product with a plain, even white background and a soft natural shadow under it.",
  "Do NOT change the product in any way. Keep its exact shape, proportions, colour, material, surface marks, scratches, dents, stains, labels, logos and printed text exactly as they are. Do not sharpen it, smooth it, repaint it, straighten it, repair it or make it look newer.",
  "Do not add anything: no text, no price, no badge, no logo, no hands, no props, no extra items. Do not remove any part of the product or anything attached to it.",
  "Keep the product at the same angle and the same size in the frame.",
].join("\n");

export const SAME_ITEM_INSTRUCTIONS = [
  "The first image is a shopkeeper's original photo of a product. The second image is an edited copy that is supposed to differ only in its background.",
  "Decide whether a customer who bought from the second image would receive exactly what the first image shows.",
  'Answer with JSON only: {"same_item": true or false, "difference": "a few words, or empty"}.',
  "same_item is true ONLY if the product in both is the same object with the same shape, proportions, colour, markings, labels, printed text, visible wear or damage, and the same number of items, with nothing added and nothing removed.",
  "If the second image looks newer, cleaner, differently coloured, differently shaped, has different or missing text on the product, or you are not sure, answer false.",
].join("\n");

/** True only on an explicit yes. Every other answer, and every failure, is a no. */
async function sameItem(apiKey: string, original: InlineImage, edited: InlineImage): Promise<boolean> {
  const answer = await askGemini(
    apiKey,
    key("AI_GEMINI_TEXT_MODEL") ?? DEFAULT_GEMINI_TEXT_MODEL,
    [asPart(original), asPart(edited), { text: SAME_ITEM_INSTRUCTIONS }],
    { responseMimeType: "application/json", maxOutputTokens: 2000, temperature: 0 },
    TIMEOUT_MS,
  );
  if (!answer) return false;
  try {
    const verdict = JSON.parse(answer.text.trim()) as { same_item?: unknown };
    return verdict.same_item === true;
  } catch {
    return false;
  }
}

async function cleanWithGemini(apiKey: string, photoUrl: string, options: HelpOptions): Promise<CleanPhotoOutcome> {
  try {
    const original = await loadPhoto(photoUrl);
    if (!original) return { ok: false, reason: "invalid-photo" };

    const answer = await askGemini(
      apiKey,
      key("AI_GEMINI_IMAGE_MODEL") ?? DEFAULT_GEMINI_IMAGE_MODEL,
      [asPart(original), { text: `${CLEAN_INSTRUCTIONS}${options.extraInstructions ?? ""}` }],
      { responseModalities: ["IMAGE"] },
      IMAGE_TIMEOUT_MS,
    );
    const edited = answer?.image;
    if (!edited) return { ok: false, reason: "provider-failed" };
    const contentType = edited.mimeType.toLowerCase();
    if (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") return { ok: false, reason: "provider-failed" };
    const size = Buffer.from(edited.data, "base64").byteLength;
    if (size === 0 || size > MAX_CLEANED_BYTES) return { ok: false, reason: "provider-failed" };

    if (!(await sameItem(apiKey, original, edited))) return { ok: false, reason: "not-faithful" };
    return { ok: true, base64: edited.data, contentType };
  } catch {
    return { ok: false, reason: "provider-failed" };
  }
}

/**
 * The same photo on a plain white background.
 *
 * `photoUrl` must be one of this project's own public product photos: this
 * function fetches whatever it is given and forwards it to a third party, and
 * an open "fetch any URL" is how a server gets used to reach things it should
 * not. The caller's ownership of the photo does not matter -- it is public --
 * but its origin does.
 */
export async function cleanPhotoBackground(photoUrl: string, options: HelpOptions = {}): Promise<CleanPhotoOutcome> {
  const apiKey = key("PHOTOROOM_API_KEY");
  const googleKey = key("GEMINI_API_KEY");
  if (!apiKey && !googleKey) return { ok: false, reason: "not-configured" };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!isValidProductPhotoUrl(photoUrl, supabaseUrl)) return { ok: false, reason: "invalid-photo" };
  // Photoroom cuts the item out rather than redrawing it, so it is preferred
  // when its key is present -- and it takes no instructions, which is why the
  // owner's lessons only reach the generative path.
  if (!apiKey) return cleanWithGemini(googleKey as string, photoUrl, options);

  try {
    const original = await fetch(photoUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!original.ok) return { ok: false, reason: "invalid-photo" };
    const bytes = await original.blob();

    const form = new FormData();
    form.append("image_file", bytes, "photo");
    form.append("format", "jpg");
    form.append("bg_color", "white");

    const response = await fetch(PHOTOROOM_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: "provider-failed" };
    if (!(response.headers.get("content-type") ?? "").startsWith("image/")) return { ok: false, reason: "provider-failed" };

    const cleaned = Buffer.from(await response.arrayBuffer());
    if (cleaned.byteLength === 0 || cleaned.byteLength > MAX_CLEANED_BYTES) return { ok: false, reason: "provider-failed" };
    return { ok: true, base64: cleaned.toString("base64"), contentType: "image/jpeg" };
  } catch {
    return { ok: false, reason: "provider-failed" };
  }
}
