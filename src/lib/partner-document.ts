/**
 * The supporting documents a shop uploads when it applies, and the rules every
 * one of them must pass.
 *
 * Decided by the owner on 6 Oct 2026: a shop that will take a customer's money
 * has to prove it is a real registered business first. Three documents, no
 * national ID — the licence and the TIN certificate already name the business,
 * and asking a shopkeeper to hand over their NIDA card to a marketplace is
 * more than the job needs.
 *
 * ## The bucket is private, and that is the whole point
 *
 * `product-photos` is public because a product photo is meant to be seen by
 * everyone. A trading licence is the opposite: it carries a person's name,
 * their premises, their taxpayer number and often a signature. So these go to
 * a **separate, private bucket** with no public URL at all. The browser
 * uploads straight into `<uid>/<applicationId>/…`, which is what the bucket's
 * insert policy checks; reading requires a short-lived signed URL that only
 * the admin console asks for.
 *
 * If you ever find yourself writing `getPublicUrl` against
 * `PARTNER_DOCUMENT_BUCKET`, stop: that is a licence leak, not a convenience.
 *
 * Pure. No Prisma, no Supabase, no `src/server` — the browser form and the
 * server action both import it, exactly like `product-photo.ts`.
 */

/** The private Storage bucket every application document lives in. */
export const PARTNER_DOCUMENT_BUCKET = "partner-documents";

/**
 * What a shop must upload. The owner chose these three on 6 Oct 2026 and
 * deliberately left the owner's national ID out.
 */
export const DOCUMENT_KINDS = ["licence", "tin", "shopfront"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && (DOCUMENT_KINDS as readonly string[]).includes(value);
}

/**
 * All three are required for a brand application. Stated as a constant rather
 * than "all of DOCUMENT_KINDS" so that making one optional later is a one-line
 * change here and not a hunt through the form.
 */
export const REQUIRED_DOCUMENT_KINDS: readonly DocumentKind[] = DOCUMENT_KINDS;

/**
 * Images and PDFs only.
 *
 * A shopkeeper photographs their licence with a phone, or has a scanned PDF
 * from whoever filed it. Nothing else is a document, and in particular no
 * office format: a `.docx` of "my licence" is a typed claim, not evidence, and
 * the reader downstream cannot see inside one anyway.
 */
export const DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const DOCUMENT_INPUT_ACCEPT = DOCUMENT_MIME_TYPES.join(",");

export function isDocumentMimeType(value: string): boolean {
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * 10 MB.
 *
 * A phone photo of an A4 licence is 2–5 MB and a scanned PDF rather less. Ten
 * leaves room for a slow camera without letting someone park a film in the
 * bucket. Photos are shrunk in the browser first (see `photo-prep`), so a file
 * that still arrives this big is either a PDF or something odd.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** The file extension for an accepted type, or `null` for one we do not take. */
export function documentExtension(mimeType: string): string | null {
  return EXTENSIONS[mimeType] ?? null;
}

/**
 * Where one document lives inside the bucket: `<uid>/<applicationId>/<kind>-<stamp>.<ext>`.
 *
 * The uid comes first because that is the segment the bucket's insert policy
 * compares against the caller's own uid — the same shape as a product photo,
 * and for the same reason. The stamp keeps a re-upload from silently
 * overwriting the first attempt, so an applicant who sends a blurry licence and
 * then a clear one leaves both behind for the reviewer rather than only the
 * last.
 *
 * Returns `null` rather than guessing when the type is not one we accept.
 */
export function partnerDocumentPath(input: {
  uid: string;
  applicationId: string;
  kind: DocumentKind;
  mimeType: string;
  stamp?: number;
}): string | null {
  const extension = documentExtension(input.mimeType);
  if (extension === null) return null;
  const uid = input.uid.trim();
  const applicationId = input.applicationId.trim();
  if (uid === "" || applicationId === "") return null;
  const stamp = input.stamp ?? Date.now();
  return `${uid}/${applicationId}/${input.kind}-${stamp}.${extension}`;
}

/**
 * Does this storage path belong to this uid?
 *
 * Checked on the server before a document row is written, so a hand-edited
 * payload cannot attach somebody else's uploaded licence — or a path outside
 * the bucket entirely — to its own application. The bucket policy is the real
 * guard; this is the second one, because a bucket policy is one dashboard
 * click away from being loosened by a future hurry.
 */
export function ownsDocumentPath(path: unknown, uid: unknown): boolean {
  // `unknown`, not `string`: both arguments come from a browser payload, and a
  // hand-edited one can send a number, a null or nothing at all. A type
  // annotation is a promise the caller makes, not one the network keeps — this
  // must answer `false` rather than throw on the way to the database.
  if (typeof path !== "string" || typeof uid !== "string") return false;
  const owner = uid.trim();
  if (owner === "" || path.includes("..")) return false;
  const segments = path.split("/");
  return segments.length === 3 && segments[0] === owner && segments[2] !== "";
}

export type DocumentFileCheck =
  | { ok: true }
  | { ok: false; reason: "wrong-type" | "too-big" | "empty" };

/**
 * The same check the browser runs for a quick error and the server runs for
 * real. Defensive about its input for the reason given on `ownsDocumentPath`:
 * the server's copy of this call is fed a payload, not a `File`.
 */
export function checkDocumentFile(file: { type: unknown; size: unknown }): DocumentFileCheck {
  if (typeof file.type !== "string" || !isDocumentMimeType(file.type)) {
    return { ok: false, reason: "wrong-type" };
  }
  if (typeof file.size !== "number" || !Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: "empty" };
  }
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, reason: "too-big" };
  return { ok: true };
}

/** Which required documents are still missing from a set that has been uploaded. */
export function missingDocumentKinds(
  uploaded: readonly { kind: string }[],
): DocumentKind[] {
  const have = new Set(uploaded.map((d) => d.kind));
  return REQUIRED_DOCUMENT_KINDS.filter((kind) => !have.has(kind));
}
