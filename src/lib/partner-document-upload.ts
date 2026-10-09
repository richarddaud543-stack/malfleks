"use client";

/**
 * Putting a shop's three documents into the private bucket, from the browser.
 *
 * The same shape as `ProductPhotoUpload`'s upload step and for the same reason:
 * the bytes go straight from the shopkeeper's phone to Supabase Storage, with
 * no server round trip, authorised as the signed-in applicant — which is
 * exactly what the bucket's insert policy checks.
 *
 * Two differences from a product photo, both deliberate:
 *
 *   * The bucket is **private**. Nothing here asks for a public URL. What it
 *     asks for instead is a short-lived **signed** URL, which it hands to the
 *     server so the AI reader can fetch the bytes once. See the long note at
 *     the top of `src/server/partners/documents.ts` for why the server cannot
 *     just read the object itself.
 *   * Nothing is re-encoded. A product photo is shrunk for the shopper's sake;
 *     a licence is evidence, and an engineer who "optimises" it is destroying
 *     the thing a reviewer needs to read. Big files are refused, not squeezed.
 */

import { createBrowserSupabase } from "@/lib/supabase-browser";
import {
  checkDocumentFile,
  PARTNER_DOCUMENT_BUCKET,
  partnerDocumentPath,
  type DocumentKind,
} from "@/lib/partner-document";

/** How long the server has to fetch the bytes. Minutes, not hours. */
const SIGNED_URL_SECONDS = 180;

export interface PickedDocument {
  kind: DocumentKind;
  file: File;
}

export interface SentDocument {
  kind: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  signedUrl: string;
}

export type UploadFailure =
  | { kind: DocumentKind; reason: "wrong-type" | "too-big" | "empty" | "failed" };

export interface UploadOutcome {
  sent: SentDocument[];
  failed: UploadFailure[];
  /** True when Supabase is not configured at all — a different message to the applicant. */
  unavailable: boolean;
}

/**
 * Upload each picked document and collect a signed URL for it.
 *
 * Partial success is a real outcome, not an error: three files on a patchy
 * connection means one can fail while two land. The caller attaches what
 * arrived and offers a retry for the rest, which is kinder than throwing away
 * two good uploads because the third timed out.
 */
export async function uploadPartnerDocuments(
  applicationId: string,
  picked: readonly PickedDocument[],
): Promise<UploadOutcome> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { sent: [], failed: [], unavailable: true };

  // The uid comes from the Supabase session, not from a prop. The bucket's
  // insert policy compares the first path segment against `auth.uid()`, so the
  // only uid that can possibly work is this one — and asking for it here means
  // no caller can pass the wrong one by mistake. `/api/auth/session` does not
  // expose the uid to the client, which is also why there is nothing to pass.
  const { data: user } = await supabase.auth.getUser();
  const uid = user?.user?.id;
  if (!uid) return { sent: [], failed: [], unavailable: true };

  const sent: SentDocument[] = [];
  const failed: UploadFailure[] = [];

  for (const { kind, file } of picked) {
    const check = checkDocumentFile(file);
    if (!check.ok) {
      failed.push({ kind, reason: check.reason });
      continue;
    }

    const storagePath = partnerDocumentPath({
      uid,
      applicationId,
      kind,
      mimeType: file.type,
    });
    if (storagePath === null) {
      failed.push({ kind, reason: "wrong-type" });
      continue;
    }

    const upload = await supabase.storage
      .from(PARTNER_DOCUMENT_BUCKET)
      // `upsert: false` — the path carries a timestamp, so a collision means
      // something is wrong rather than that the applicant is replacing a file.
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      failed.push({ kind, reason: "failed" });
      continue;
    }

    const signed = await supabase.storage
      .from(PARTNER_DOCUMENT_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      // The file is in the bucket; only the reader's link failed. Record it
      // anyway with no URL so the admin still sees the document — it just will
      // not have been screened.
      sent.push({
        kind,
        storagePath,
        mimeType: file.type,
        byteSize: file.size,
        signedUrl: "",
      });
      continue;
    }

    sent.push({
      kind,
      storagePath,
      mimeType: file.type,
      byteSize: file.size,
      signedUrl: signed.data.signedUrl,
    });
  }

  return { sent, failed, unavailable: false };
}
