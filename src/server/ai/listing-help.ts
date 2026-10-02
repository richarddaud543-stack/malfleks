import { isValidProductPhotoUrl } from "@/lib/product-photo";

/**
 * Optional AI help for a partner writing a listing.
 *
 * Two things, each switched on only by its own key being present in the
 * environment -- with no key the buttons are not drawn and nothing here is
 * ever called, so the site behaves exactly as it did before 3 Oct 2026:
 *
 *  - `ANTHROPIC_API_KEY`  -> "Help me write this": a draft description from
 *    the facts the partner typed (and the main photo, if there is one).
 *  - `PHOTOROOM_API_KEY`  -> "Clean background": the same photo with what is
 *    behind the item replaced by plain white.
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
 *    segmentation endpoint leaves the item's own pixels alone (its docs say
 *    so, and it is why that endpoint was chosen over generative "enhance"
 *    tools, which redraw the product). The partner's original photo stays in
 *    the listing beside the cleaned one.
 *
 * Neither provider's response is trusted further than its shape: the draft is
 * trimmed and capped to the same length the validator enforces, and the image
 * is only handed back to the browser, which re-encodes and uploads it through
 * the same path as any other photo.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PHOTOROOM_URL = "https://sdk.photoroom.com/v1/segment";

/** Overridable without a deploy, because model names are retired on a schedule the code does not control. */
const DEFAULT_MODEL = "claude-sonnet-5-5";

/** The validator's own ceiling; a draft longer than this could not be submitted anyway. */
export const DRAFT_MAX_CHARS = 800;

const TIMEOUT_MS = 25_000;
/** A cleaned 1600px JPEG is a few hundred KB. Anything far past that is not what was asked for. */
const MAX_CLEANED_BYTES = 4 * 1024 * 1024;

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
  return { describe: key("ANTHROPIC_API_KEY") !== null, cleanPhoto: key("PHOTOROOM_API_KEY") !== null };
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

export async function draftDescription(input: DraftInput): Promise<DraftOutcome> {
  const apiKey = key("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, reason: "not-configured" };
  // A name alone is not something to write about; say so rather than pay for padding.
  const hasSomething = input.notes.trim().length >= 10 || input.specs.some((s) => s.key.trim() && s.value.trim()) || input.photoUrl !== null;
  if (input.name.trim().length < 2 || !hasSomething) return { ok: false, reason: "not-enough" };

  const content: unknown[] = [];
  if (input.photoUrl) content.push({ type: "image", source: { type: "url", url: input.photoUrl } });
  content.push({ type: "text", text: `${DRAFT_INSTRUCTIONS}\n\nFacts:\n${buildDraftFacts(input)}` });

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

export type CleanPhotoOutcome =
  | { ok: true; base64: string; contentType: "image/jpeg" }
  | { ok: false; reason: "not-configured" | "invalid-photo" | "provider-failed" };

/**
 * The same photo on a plain white background.
 *
 * `photoUrl` must be one of this project's own public product photos: this
 * function fetches whatever it is given and forwards it to a third party, and
 * an open "fetch any URL" is how a server gets used to reach things it should
 * not. The caller's ownership of the photo does not matter -- it is public --
 * but its origin does.
 */
export async function cleanPhotoBackground(photoUrl: string): Promise<CleanPhotoOutcome> {
  const apiKey = key("PHOTOROOM_API_KEY");
  if (!apiKey) return { ok: false, reason: "not-configured" };
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!isValidProductPhotoUrl(photoUrl, supabaseUrl)) return { ok: false, reason: "invalid-photo" };

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
