"use client";

import { useId } from "react";

import { useLocale } from "@/i18n/client";
import { APPLY } from "@/i18n/copy/apply";
import {
  DOCUMENT_INPUT_ACCEPT,
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  REQUIRED_DOCUMENT_KINDS,
  type DocumentKind,
} from "@/lib/partner-document";

/**
 * The three file pickers on the application form: trading licence, TIN
 * certificate, shop front.
 *
 * Picking only. Nothing is uploaded here — the storage path needs the
 * application's id, which does not exist until the form is submitted, so the
 * files are held in the parent's state and sent afterwards. See the note in
 * `src/app/actions/partner-documents.ts` on why that order was chosen.
 *
 * ## Why each field says what it is for
 *
 * A shopkeeper asked for their trading licence by a website, with no reason
 * given, reasonably assumes the worst. So the section opens by saying *why*
 * (the customer's money is held, so the shop has to be real) and promises what
 * it does not do (these are never shown publicly). That sentence is as much
 * part of the feature as the upload is.
 */

export type PickedFiles = Partial<Record<DocumentKind, File>>;

const LABELS: Record<
  DocumentKind,
  {
    label: "documentLicence" | "documentTin" | "documentShopfront" | "documentDriving";
    hint: "documentLicenceHint" | "documentTinHint" | "documentShopfrontHint" | "documentDrivingHint";
  }
> = {
  licence: { label: "documentLicence", hint: "documentLicenceHint" },
  tin: { label: "documentTin", hint: "documentTinHint" },
  shopfront: { label: "documentShopfront", hint: "documentShopfrontHint" },
  driving: { label: "documentDriving", hint: "documentDrivingHint" },
};

function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PartnerDocumentFields({
  files,
  problems,
  onChange,
  disabled = false,
  kinds = REQUIRED_DOCUMENT_KINDS,
  forCourier = false,
}: {
  files: PickedFiles;
  /** Per-document message, already in the reader's language. */
  problems: Partial<Record<DocumentKind, string>>;
  onChange: (kind: DocumentKind, file: File | null) => void;
  disabled?: boolean;
  /** Which documents to ask for: a shop's three, a rider's licence, or only the missing ones on the partner page. */
  kinds?: readonly DocumentKind[];
  /** A delivery rider rather than a shop: says why a rider is asked. */
  forCourier?: boolean;
}) {
  const locale = useLocale();
  const copy = APPLY[locale].form;
  const groupId = useId();

  return (
    <section className="rounded-2xl border border-border bg-surface-2 p-5">
      <h2 className="font-display text-base font-medium">{copy.documentsHeading}</h2>
      <p className="mt-2 text-sm text-muted">{forCourier ? copy.documentsIntroCourier : copy.documentsIntro}</p>
      <p className="mt-2 text-sm text-muted">
        <strong className="font-medium">{copy.documentsPrivate}</strong>
      </p>

      <ul className="mt-5 grid gap-4">
        {DOCUMENT_KINDS.filter((kind) => kinds.includes(kind)).map((kind) => {
          const words = LABELS[kind];
          const inputId = `${groupId}-${kind}`;
          const hintId = `${inputId}-hint`;
          const errorId = `${inputId}-error`;
          const chosen = files[kind];
          const problem = problems[kind];

          return (
            <li key={kind}>
              <label htmlFor={inputId} className="block text-sm font-medium">
                {copy[words.label]}
              </label>
              <p id={hintId} className="mt-1 text-sm text-muted">
                {copy[words.hint]}
              </p>

              <input
                id={inputId}
                data-field={`document-${kind}`}
                type="file"
                accept={DOCUMENT_INPUT_ACCEPT}
                disabled={disabled}
                aria-invalid={Boolean(problem) || undefined}
                aria-describedby={problem ? `${hintId} ${errorId}` : hintId}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  onChange(kind, file);
                }}
                className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-full file:border file:border-border file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-2"
              />

              {chosen ? (
                <p className="mt-1.5 text-sm text-muted">
                  {copy.documentDone}: {chosen.name} ({sizeLabel(chosen.size)})
                </p>
              ) : null}

              {problem ? (
                <p id={errorId} className="mt-1.5 text-sm text-danger">
                  {problem}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-muted">
        {`${DOCUMENT_INPUT_ACCEPT.replace(/application\/pdf/, "PDF").replace(/image\//g, "").toUpperCase()} · ${sizeLabel(MAX_DOCUMENT_BYTES)} max`}
      </p>
    </section>
  );
}
