"use server";

import { isValidProductPhotoUrl } from "@/lib/product-photo";
import type { CleanPhotoOutcome, DraftOutcome } from "@/server/ai/listing-help";
import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";
import { logServerError } from "@/server/error-log";
import { checkRateLimit } from "@/server/rate-limit";

/**
 * The two optional AI helpers on the "List a product" form. See
 * `src/server/ai/listing-help.ts` for what they do and what they must never do.
 *
 * Since 4 Oct 2026 neither action does the work itself: it hands it to the
 * agent whose job it is (`photo-studio`, `catalogue-writer`), so every use is
 * recorded in the city's archive, obeys the owner's lessons, and stops when he
 * pauses that agent. The seller sees no difference.
 *
 * Both cost money per call, so both are gated the way a write is: signed in,
 * an *active brand partner* (proved from the database, not from the page that
 * drew the button), and rate-limited per person. Someone who is not a partner
 * cannot use MalFleks's account to write their essays or edit their photos.
 */

const DRAFT_LIMIT = { action: "ai-draft-description", limit: 20, windowMs: 60 * 60_000 };
const CLEAN_LIMIT = { action: "ai-clean-photo", limit: 20, windowMs: 60 * 60_000 };

type Blocker = "signed-out" | "unavailable" | "not-a-partner" | "rate-limited" | "paused";

async function activeBrandPartner(): Promise<{ ok: true; uid: string } | { ok: false; reason: Blocker }> {
  if (!isAuthConfigured()) return { ok: false, reason: "unavailable" };
  const session = await verifySession();
  if (!session) return { ok: false, reason: "signed-out" };
  const { partnerForUser } = await import("@/server/partners/portal");
  const partner = await partnerForUser(session.uid);
  if (!partner || partner.kind !== "brand" || partner.status !== "active") return { ok: false, reason: "not-a-partner" };
  return { ok: true, uid: session.uid };
}

export type DraftDescriptionResult =
  | { ok: true; description: string }
  | { ok: false; reason: Blocker | "not-enough" | "provider-failed" };

export async function draftDescriptionAction(input: {
  name: string;
  category: string;
  notes: string;
  specs: { key: string; value: string }[];
  photoUrl: string | null;
}): Promise<DraftDescriptionResult> {
  let uid: string | undefined;
  try {
    const who = await activeBrandPartner();
    if (!who.ok) return who;
    uid = who.uid;

    const { listingAiFeatures } = await import("@/server/ai/listing-help");
    if (!listingAiFeatures().describe) return { ok: false, reason: "unavailable" };

    const limit = await checkRateLimit(who.uid, DRAFT_LIMIT);
    if (!limit.allowed) return { ok: false, reason: "rate-limited" };

    // Nothing from the browser is trusted for shape: strings only, and the
    // photo only if it is one of this project's own.
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const photoUrl = typeof input?.photoUrl === "string" && isValidProductPhotoUrl(input.photoUrl, supabaseUrl) ? input.photoUrl : null;
    const specs = Array.isArray(input?.specs)
      ? input.specs.slice(0, 12).map((spec) => ({ key: text(spec?.key), value: text(spec?.value) }))
      : [];

    const { runAgent } = await import("@/agents/runtime");
    const shift = await runAgent("catalogue-writer", "event", {
      input: { name: text(input?.name), category: text(input?.category), notes: text(input?.notes), specs, photoUrl },
    });
    // The agent is in the registry, so `unknown-agent` cannot happen; a skipped
    // shift means the owner paused it or sent it back to school.
    if (!shift.ok) return { ok: false, reason: "unavailable" };
    if (shift.run.outcome === "skipped") return { ok: false, reason: "paused" };
    if (shift.run.outcome === "error") return { ok: false, reason: "unavailable" };

    const outcome = shift.data as DraftOutcome | undefined;
    if (!outcome) return { ok: false, reason: "unavailable" };
    if (outcome.ok) return outcome;
    if (outcome.reason === "not-configured") return { ok: false, reason: "unavailable" };
    if (outcome.reason === "provider-failed") await logServerError("ai-draft-description", new Error("The description provider did not return a usable draft"), who.uid);
    return { ok: false, reason: outcome.reason };
  } catch (error) {
    await logServerError("ai-draft-description", error, uid);
    return { ok: false, reason: "unavailable" };
  }
}

export type CleanPhotoResult =
  | { ok: true; base64: string; contentType: "image/jpeg" | "image/png" | "image/webp" }
  | { ok: false; reason: Blocker | "invalid-photo" | "provider-failed" | "not-faithful" };

export async function cleanPhotoBackgroundAction(photoUrl: string): Promise<CleanPhotoResult> {
  let uid: string | undefined;
  try {
    const who = await activeBrandPartner();
    if (!who.ok) return who;
    uid = who.uid;

    const { listingAiFeatures } = await import("@/server/ai/listing-help");
    if (!listingAiFeatures().cleanPhoto) return { ok: false, reason: "unavailable" };

    const limit = await checkRateLimit(who.uid, CLEAN_LIMIT);
    if (!limit.allowed) return { ok: false, reason: "rate-limited" };

    const { runAgent } = await import("@/agents/runtime");
    const shift = await runAgent("photo-studio", "event", { input: { photoUrl: typeof photoUrl === "string" ? photoUrl : "" } });
    if (!shift.ok) return { ok: false, reason: "unavailable" };
    if (shift.run.outcome === "skipped") return { ok: false, reason: "paused" };
    if (shift.run.outcome === "error") return { ok: false, reason: "unavailable" };

    const outcome = shift.data as CleanPhotoOutcome | undefined;
    if (!outcome) return { ok: false, reason: "unavailable" };
    if (outcome.ok) return outcome;
    if (outcome.reason === "not-configured") return { ok: false, reason: "unavailable" };
    if (outcome.reason === "provider-failed") await logServerError("ai-clean-photo", new Error("The photo provider did not return a usable image"), who.uid);
    // Not an error, but worth counting: how often the model changes the item is what decides whether it stays switched on.
    if (outcome.reason === "not-faithful") await logServerError("ai-clean-photo", new Error("The cleaned photo was rejected: the item did not match the original"), who.uid);
    return { ok: false, reason: outcome.reason };
  } catch (error) {
    await logServerError("ai-clean-photo", error, uid);
    return { ok: false, reason: "unavailable" };
  }
}
