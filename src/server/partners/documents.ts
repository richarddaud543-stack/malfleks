/**
 * The server half of shop registration documents: recording what was uploaded,
 * running the AI reader over it, and handing an admin a short-lived link to
 * look at one.
 *
 * ## Why the bytes arrive as a signed URL rather than being fetched by us
 *
 * This app has **no Supabase service-role key**, on purpose — see the note in
 * `.env.example`. So the server cannot reach into Storage on its own authority,
 * and that is a feature: nothing in a deploy can read every licence in the
 * bucket. What it can do is follow a link.
 *
 * The applicant's browser uploads the file (it is authorised as itself, which
 * is what the bucket's insert policy checks), then asks Supabase for a
 * short-lived signed URL for the object it just created — again as itself — and
 * passes that URL here. We fetch the bytes through it, screen them, and forget
 * them. The URL expires in minutes and is never stored.
 *
 * An admin looking at a document later goes the same way round:
 * `signedDocumentUrl` asks Supabase for a link using the **admin's own**
 * session. That requires the bucket's select policy to allow MalFleks's own
 * admin accounts; if it does not, the link simply fails and the admin page says
 * so rather than pretending.
 *
 * ## The bucket, once, by hand
 *
 * `partner-documents` must be created **private** (no public access) with:
 *
 *   insert: `bucket_id = 'partner-documents' AND (storage.foldername(name))[1] = auth.uid()::text`
 *   select: the same, OR the caller's email is in MalFleks's admin allowlist
 *
 * A public bucket here is a licence leak. There is a test that the code never
 * asks for a public URL, but no test can un-publish a bucket somebody made
 * public in a dashboard.
 *
 * ## Deleting
 *
 * `PartnerDocument` rows cascade with the application. The Storage objects do
 * not: nothing here deletes them, because an application an admin rejected is
 * exactly the one whose paperwork you may need to look at again. Clearing out
 * old objects is a deliberate housekeeping job for the owner, not a side effect
 * of a row disappearing.
 */

import {
  checkApplicationDocuments,
  isDocumentCheckConfigured,
  type DocumentBytes,
  type DocumentCheckResult,
} from "@/server/ai/document-check";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import {
  checkDocumentFile,
  isDocumentKind,
  missingDocumentKinds,
  ownsDocumentPath,
  PARTNER_DOCUMENT_BUCKET,
  type DocumentKind,
} from "@/lib/partner-document";

/** How long an admin's view link lasts. Long enough to open, short enough not to forward. */
const ADMIN_LINK_SECONDS = 300;

/** A document fetch that hangs must not hold up the applicant's screen. */
const FETCH_TIMEOUT_MS = 20_000;

/** The hard ceiling on what we will pull down from a signed URL, whatever it claims. */
const MAX_FETCH_BYTES = 10 * 1024 * 1024;

export interface UploadedDocument {
  kind: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  /** Short-lived, from the applicant's own browser. Used once, never stored. */
  signedUrl: string;
}

export type RecordOutcome =
  | { ok: true; recorded: number }
  | { ok: false; reason: "no-application" | "not-yours" | "bad-document" };

/**
 * Attach uploaded documents to the caller's own pending application.
 *
 * Every field is re-checked here even though the browser checked it: the kind,
 * the mime type, the size, and above all that the storage path is under this
 * uid. A caller who hand-edits the payload can name any path it likes; this is
 * what stops it naming somebody else's.
 */
export async function recordApplicationDocuments(
  uid: string,
  applicationId: string,
  documents: readonly UploadedDocument[],
): Promise<RecordOutcome> {
  const db = getPrisma();

  const application = await db.partnerApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, uid: true, status: true },
  });
  if (!application) return { ok: false, reason: "no-application" };
  if (application.uid !== uid) return { ok: false, reason: "not-yours" };

  const rows = [];
  for (const document of documents) {
    if (!isDocumentKind(document.kind)) return { ok: false, reason: "bad-document" };
    if (!ownsDocumentPath(document.storagePath, uid)) return { ok: false, reason: "bad-document" };
    const file = checkDocumentFile({ type: document.mimeType, size: document.byteSize });
    if (!file.ok) return { ok: false, reason: "bad-document" };
    rows.push({
      applicationId,
      uid,
      kind: document.kind,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      byteSize: document.byteSize,
    });
  }
  if (rows.length === 0) return { ok: true, recorded: 0 };

  // `skipDuplicates` on the unique storagePath: a double-submit of the same
  // upload records it once rather than failing the whole batch.
  const created = await db.partnerDocument.createMany({ data: rows, skipDuplicates: true });
  return { ok: true, recorded: created.count };
}

/** Which of the three required documents an application is still missing. */
export async function missingDocumentsFor(applicationId: string): Promise<DocumentKind[]> {
  const uploaded = await getPrisma().partnerDocument.findMany({
    where: { applicationId },
    select: { kind: true },
  });
  return missingDocumentKinds(uploaded);
}

/** Pull one document's bytes down through its signed URL. Null on anything unexpected. */
async function fetchBytes(signedUrl: string, declaredType: string): Promise<Buffer | null> {
  try {
    const response = await fetch(signedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const served = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    // Storage serves back what was uploaded. A mismatch means the path is not
    // the file we think it is, which is a reason to stop rather than to guess.
    if (served !== "" && served !== declaredType) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FETCH_BYTES) return null;
    return bytes;
  } catch {
    return null;
  }
}

export type ScreenOutcome =
  | { ok: true; verdict: string; notes: string }
  | { ok: false; reason: "not-configured" | "nothing-to-read" | "provider-failed" };

/**
 * Read an application's documents and write the verdict onto it.
 *
 * **This never changes the application's status.** It fills in `aiVerdict`,
 * `aiNotes` and `aiCheckedAt` — three advisory columns an admin reads — and
 * stops. The decision stays with the person. If you are about to add
 * `status: "approved"` to the update below, re-read the top of
 * `src/server/ai/document-check.ts` first.
 *
 * Failures are recorded as failures rather than as a verdict, so "we could not
 * read these" never looks like "these are fine".
 */
export async function screenApplicationDocuments(
  applicationId: string,
  documents: readonly UploadedDocument[],
): Promise<ScreenOutcome> {
  if (!isDocumentCheckConfigured()) return { ok: false, reason: "not-configured" };

  const db = getPrisma();
  const application = await db.partnerApplication.findUnique({
    where: { id: applicationId },
    select: { businessName: true, city: true, contactName: true },
  });
  if (!application) return { ok: false, reason: "nothing-to-read" };

  const loaded: DocumentBytes[] = [];
  for (const document of documents) {
    if (!isDocumentKind(document.kind)) continue;
    const bytes = await fetchBytes(document.signedUrl, document.mimeType);
    if (bytes === null) continue;
    loaded.push({ kind: document.kind, mimeType: document.mimeType, bytes });
  }
  if (loaded.length === 0) return { ok: false, reason: "nothing-to-read" };

  let result: DocumentCheckResult;
  try {
    result = await checkApplicationDocuments(application, loaded);
  } catch (error) {
    await logServerError("screen-application-documents", error);
    return { ok: false, reason: "provider-failed" };
  }
  if (!result.ok) return { ok: false, reason: result.reason };

  const checkedAt = new Date();
  await db.partnerApplication.update({
    where: { id: applicationId },
    data: { aiVerdict: result.verdict, aiNotes: result.notes, aiCheckedAt: checkedAt },
  });

  // Each document's own line, so an admin can see which file the concern is
  // about without reading the summary twice.
  for (const finding of result.findings) {
    await db.partnerDocument.updateMany({
      where: { applicationId, kind: finding.kind },
      data: { aiVerdict: finding.verdict, aiNotes: finding.notes, aiCheckedAt: checkedAt },
    });
  }

  return { ok: true, verdict: result.verdict, notes: result.notes };
}

/**
 * A short-lived link an admin can open to look at one document.
 *
 * Asked for with the admin's **own** Supabase session, so it works only if the
 * bucket's select policy allows MalFleks's admin accounts — see the bucket note
 * at the top of this file. `null` rather than an exception: the admin page shows
 * "this link isn't available" beside the document, which is a truthful thing to
 * show and does not take the rest of the queue down with it.
 */
export async function signedDocumentUrl(storagePath: string): Promise<string | null> {
  try {
    const { createServerSupabase } = await import("@/server/auth/supabase");
    const supabase = await createServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from(PARTNER_DOCUMENT_BUCKET)
      .createSignedUrl(storagePath, ADMIN_LINK_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (error) {
    await logServerError("signed-document-url", error);
    return null;
  }
}
