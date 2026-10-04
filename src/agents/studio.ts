import { cleanPhotoBackground, draftDescription, type DraftInput } from "@/server/ai/listing-help";
import type { Agent, AgentShift, AgentResult, Lesson } from "./types";

/**
 * The two residents who work on a seller's listing: the photo studio and the
 * catalogue writer.
 *
 * ## Why these are agents and not just two buttons
 *
 * The buttons already existed and already worked. Moving the work into the city
 * changes four things, and each is worth the move on its own:
 *
 *  - **It is recorded.** Every cleaning and every draft is a shift in the
 *    archive, with what it cost and whether it was kept. "Is the photo cleaner
 *    good enough to leave switched on?" becomes a question with an answer.
 *  - **The owner can teach them.** A lesson written in the school is added to
 *    what the model is told, in the owner's own words, with no deploy.
 *  - **The owner can stop them.** Pausing the studio, or sending it back to
 *    school, switches the button off and the spending with it.
 *  - **They can ask.** A question at the help desk is asked once, ever.
 *
 * What it does *not* change is the seller's experience: they press the same
 * button and wait the same few seconds. The work happens in the shift, and the
 * result is handed straight back.
 *
 * ## What neither of them may do
 *
 * Nothing reaches a customer. The draft is shown to the seller, who must press
 * "Use this"; the cleaned photo is added *beside* the original, never over it;
 * and MalFleks still reviews the listing before it is published.
 */

/** The owner's lessons, as a block appended to what the model is told. Empty when nothing has been taught. */
export function lessonBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map((lesson) => `- ${lesson.title}: ${lesson.body}`).join("\n");
  // Last, so it is read as the owner's standing instruction on top of the rest
  // -- but it cannot loosen the rules above it: those forbid inventing facts
  // and changing the product, and a lesson is not a way around them.
  return `\n\nWhat MalFleks's owner has told you. Follow it unless it would mean inventing something or changing the product:\n${lines}`;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/* ------------------------------------------------------------------ studio */

interface PhotoWork {
  photoUrl: string;
}

function photoWork(input: unknown): PhotoWork | null {
  if (!input || typeof input !== "object") return null;
  const url = text((input as Record<string, unknown>).photoUrl);
  return url ? { photoUrl: url } : null;
}

async function runStudio(shift: AgentShift): Promise<AgentResult> {
  const work = photoWork(shift.input);
  if (!work) {
    // A clock woke it. There is no queue of photos to work through: a seller
    // asks, and the shift happens then. So it has nothing to do, and says so
    // rather than inventing work.
    return { outcome: "ok", summary: "Nothing to clean: this one only works when a seller asks.", metrics: { cleaned: 0 } };
  }

  const outcome = await cleanPhotoBackground(work.photoUrl, { extraInstructions: lessonBlock(shift.lessons) });

  if (outcome.ok) {
    const kb = Math.round((outcome.base64.length * 3) / 4 / 1024);
    shift.note("info", `Cleaned one photo (${kb} KB ${outcome.contentType.replace("image/", "")}), and the check said the item is unchanged.`);
    return {
      outcome: "ok",
      summary: `Cleaned a photo's background. The item was checked against the original and matched.`,
      metrics: { cleaned: 1, rejected: 0, kb },
      data: outcome,
    };
  }

  // "not-faithful" is the check doing its job, so it is the one failure worth
  // the owner's eye: a lot of them means the model is not usable for this.
  if (outcome.reason === "not-faithful") {
    shift.note("problem", "The cleaned copy changed how the item looks, so it was thrown away and the seller keeps the original.");
    return {
      outcome: "attention",
      summary: "Threw away a cleaned photo: it changed the item. The seller's original is untouched.",
      metrics: { cleaned: 0, rejected: 1 },
      data: outcome,
    };
  }

  shift.note(outcome.reason === "not-configured" ? "watch" : "problem", `Could not clean the photo: ${outcome.reason}.`);
  return {
    outcome: "attention",
    summary: `Could not clean a photo (${outcome.reason}). The seller keeps the original.`,
    metrics: { cleaned: 0, rejected: 0, failed: 1 },
    data: outcome,
  };
}

export const photoStudio: Agent = {
  key: "photo-studio",
  name: "The photo studio",
  office: "Studio",
  job: "Puts a seller's own photo of an item on a clean white background, and throws the result away if the item changed.",
  reads: ["The photo the seller just uploaded"],
  writes: ["Nothing. The cleaned copy is handed back to the seller to keep or discard"],
  boundary: "It never replaces the seller's original photo, and a cleaned copy that does not match the original is destroyed, not offered.",
  needsModel: true,
  curriculum: ["promise", "honesty", "city"],
  // Already live as a button before the city existed, and it only ever offers
  // the seller a copy to accept or ignore, so there is nothing to supervise
  // into existence: it starts able to work.
  defaultRank: "employed",
  run: runStudio,
};

/* --------------------------------------------------------------- catalogue */

function draftWork(input: unknown): DraftInput | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const name = text(row.name);
  if (!name) return null;
  const specs = Array.isArray(row.specs)
    ? row.specs.slice(0, 12).map((spec) => ({ key: text((spec as Record<string, unknown>)?.key), value: text((spec as Record<string, unknown>)?.value) }))
    : [];
  return {
    name,
    category: text(row.category),
    notes: text(row.notes),
    specs,
    photoUrl: text(row.photoUrl) || null,
  };
}

async function runCatalogue(shift: AgentShift): Promise<AgentResult> {
  const work = draftWork(shift.input);
  if (!work) {
    return { outcome: "ok", summary: "Nothing to write: this one only works when a seller asks.", metrics: { drafted: 0 } };
  }

  const outcome = await draftDescription(work, { extraInstructions: lessonBlock(shift.lessons) });

  if (outcome.ok) {
    shift.note("info", `Drafted ${outcome.description.length} characters for "${work.name}". The seller decides whether to use it.`);
    return {
      outcome: "ok",
      summary: `Drafted a description for "${work.name}" from the seller's own facts.`,
      metrics: { drafted: 1, characters: outcome.description.length, hadPhoto: work.photoUrl !== null },
      data: outcome,
    };
  }

  // Refusing to write from a name alone is the agent keeping its promise, not a
  // fault: a padded description is exactly what must not be produced.
  if (outcome.reason === "not-enough") {
    shift.note("info", `Refused to write about "${work.name}": the seller gave nothing to write from, and a padded description would be a guess.`);
    return { outcome: "ok", summary: "Refused to write from a name alone.", metrics: { drafted: 0, refused: 1 }, data: outcome };
  }

  shift.note(outcome.reason === "not-configured" ? "watch" : "problem", `Could not draft a description: ${outcome.reason}.`);
  return {
    outcome: "attention",
    summary: `Could not draft a description (${outcome.reason}).`,
    metrics: { drafted: 0, failed: 1 },
    data: outcome,
  };
}

export const catalogueWriter: Agent = {
  key: "catalogue-writer",
  name: "The catalogue writer",
  office: "Catalogue",
  job: "Writes a product description from the facts the seller typed, and nothing else.",
  reads: ["What the seller typed into the listing form", "The main photo, if there is one"],
  writes: ["Nothing. The draft is shown to the seller, who chooses whether to use it"],
  boundary:
    "It never adds a specification, a condition, a warranty, an accessory or a claim the seller did not give, and never guesses one from a photo. Thin facts mean a short description.",
  needsModel: true,
  curriculum: ["promise", "order-life", "honesty", "city"],
  defaultRank: "employed",
  run: runCatalogue,
};
