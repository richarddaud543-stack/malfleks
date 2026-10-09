"use client";

import { useId, useState } from "react";

import { useLocale } from "@/i18n/client";
import { APPLY } from "@/i18n/copy/apply";
import {
  checkDocumentFile,
  DOCUMENT_INPUT_ACCEPT,
  DOCUMENT_KINDS,
  PARTNER_DOCUMENT_BUCKET,
  partnerDocumentPath,
  type DocumentKind,
} from "@/lib/partner-document";
import { createBrowserSupabase } from "@/lib/supabase-browser";

/**
 * The three files a shop attaches to its application: licence, TIN
 * certificate, shop front.
 *
 * ## What this is NOT
 *
 * It is not `ProductPhotoUpload` with different labels. A product photo goes to
 * a public bucket and is meant to be seen; these go to a **private** bucket and
 * must never be. In particular this component never calls `getPublicUrl` — it
 * asks for a short-lived **signed** URL instead, which exists only so the
 * server can read the bytes once to screen them, and is never stored or shown.
 *
 * Nor are these photos shrunk the way product photos are. The whole value of a
 * licence is that the small print is readable; re-encoding it down to 1600px is
 * how a reader ends up saying "unreadable" about a document that was fine. They
 * go up as they are, inside a 10MB ceiling.
 *
 * ## The upload cannot start until the application exists
 *
 * The storage path contains the application's id, so this component is handed
 * `applicationId` and does nothing until it has one. The form submits the
 * application first and then renders this — see `attachApplicationDocuments`
 * for why that order, and what happens when the upload half fails.
 *
 * `onChange` reports the files that finished uploading. The parent sends them
 * to the server; this component never calls a server action itself.
 */

export interface UploadedDocumentDraft {
  kind: DocumentKind;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  signedUrl: string;
}

/** How long the server gets to read the file. One fetch, straight away. */
const SIGNED_URL_SECONDS = 600;

type SlotState =
  | { phase: "empty" }
  | { phase: "uploading"; name: string }
  | { phase: "done"; name: string; document: UploadedDocumentDraft }
  | { phase: "failed"; name: string; message: string };

interface Props {
  applicationId: string;
  /** Called whenever the set of finished uploads changes. */
  onChange: (documents: UploadedDocumentDraft[]) => void;
  /** Marks the slots the parent is still waiting for, after a failed send. */
  highlightMissing?: boolean;
  disabled?: boolean;
}

export default function PartnerDocumentUpload({
  applicationId,
  onChange,
  highlightMissing = false,
  disabled = false,
}: Props) {
  const locale = useLocale();
  const copy = APPLY[locale].form;
  const groupId = useId();

  const [slots, setSlots] = useState<Record<DocumentKind, SlotState>>({
    licence: { phase: "empty" },
    tin: { phase: "empty" },
    shopfront: { phase: "empty" },
  });

  const labels: Record<DocumentKind, { title: string; hint: string }> = {
    licence: { title: copy.documentLicence, hint: copy.documentLicenceHint },
    tin: { title: copy.documentTin, hint: copy.documentTinHint },
    shopfront: { title: copy.documentShopfront, hint: copy.documentShopfrontHint },
  };

  function report(next: Record<DocumentKind, SlotState>) {
    const done: UploadedDocumentDraft[] = [];
    for (const kind of DOCUMENT_KINDS) {
      const slot = next[kind];
      if (slot.phase === "done") done.push(slot.document);
    }
    onChange(done);
  }

  function update(kind: DocumentKind, state: SlotState) {
    setSlots((current) => {
      const next = { ...current, [kind]: state };
      report(next);
      return next;
    });
  }

  async function upload(kind: DocumentKind, file: File) {
    const check = checkDocumentFile({ type: file.type, size: file.size });
    if (!check.ok) {
      const message =
        check.reason === "wrong-type"
          ? copy.documentWrongType
          : check.reason === "too-big"
            ? copy.documentTooBig
            : copy.documentEmpty;
      update(kind, { phase: "failed", name: file.name, message });
      return;
    }

    const supabase = createBrowserSupabase();
    // The path needs the uid, and it has to be the uid the upload is authorised
    // as — that is the one the bucket policy compares the first path segment
    // against. So it comes from the live session, never from a prop a parent
    // could get wrong.
    const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const uid = auth.user?.id ?? "";
    const objectPath =
      uid === "" ? null : partnerDocumentPath({ uid, applicationId, kind, mimeType: file.type });

    if (!supabase || objectPath === null) {
      update(kind, { phase: "failed", name: file.name, message: copy.documentUnavailable });
      return;
    }

    update(kind, { phase: "uploading", name: file.name });

    const { error: uploadError } = await supabase.storage
      .from(PARTNER_DOCUMENT_BUCKET)
      .upload(objectPath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      update(kind, { phase: "failed", name: file.name, message: copy.documentFailed });
      return;
    }

    // A signed URL, never a public one. It is handed to the server so it can
    // read the file once; it expires, and nothing keeps it.
    const { data: signed, error: signError } = await supabase.storage
      .from(PARTNER_DOCUMENT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_SECONDS);
    if (signError || !signed?.signedUrl) {
      update(kind, { phase: "failed", name: file.name, message: copy.documentFailed });
      return;
    }

    update(kind, {
      phase: "done",
      name: file.name,
      document: {
        kind,
        storagePath: objectPath,
        mimeType: file.type,
        byteSize: file.size,
        signedUrl: signed.signedUrl,
      },
    });
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface-2 p-5">
      <h2 className="font-display text-base font-medium">{copy.documentsHeading}</h2>
      <p className="mt-2 text-sm text-muted">{copy.documentsIntro}</p>
      <p className="mt-2 text-sm text-muted">{copy.documentsPrivate}</p>

      <ul className="mt-5 grid gap-4">
        {DOCUMENT_KINDS.map((kind) => {
          const slot = slots[kind];
          const inputId = `${groupId}-${kind}`;
          const missing = highlightMissing && slot.phase !== "done";
          return (
            <li
              key={kind}
              className={`rounded-xl border p-4 ${missing ? "border-danger" : "border-border"}`}
            >
              <label htmlFor={inputId} className="block text-sm font-medium">
                {labels[kind].title}
              </label>
              <p className="mt-1 text-xs text-muted">{labels[kind].hint}</p>

              <input
                id={inputId}
                type="file"
                accept={DOCUMENT_INPUT_ACCEPT}
                disabled={disabled || slot.phase === "uploading"}
                className="mt-3 block w-full text-sm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Clear the input so choosing the same file again re-uploads
                  // it; a retry after a failure is the common case.
                  event.target.value = "";
                  if (file) void upload(kind, file);
                }}
              />

              <p className="mt-2 text-xs" aria-live="polite">
                {slot.phase === "uploading" && <span className="text-muted">{copy.documentUploading}</span>}
                {slot.phase === "done" && (
                  <span className="text-accent">
                    {copy.documentDone} — {slot.name}
                  </span>
                )}
                {slot.phase === "failed" && <span className="text-danger">{slot.message}</span>}
                {slot.phase === "empty" && missing && (
                  <span className="text-danger">{copy.documentMissing}</span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
