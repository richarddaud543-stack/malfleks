"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { attachApplicationDocuments } from "@/app/actions/partner-documents";
import PartnerDocumentFields, { type PickedFiles } from "@/components/apply/PartnerDocumentFields";
import { useLocale } from "@/i18n/client";
import { APPLY } from "@/i18n/copy/apply";
import { PARTNER } from "@/i18n/copy/partner";
import { checkDocumentFile, DOCUMENT_KINDS, type DocumentKind } from "@/lib/partner-document";
import { uploadPartnerDocuments } from "@/lib/partner-document-upload";

/**
 * A partner already on MalFleks sending its documents: a shop's business
 * licence, TIN certificate and shop-front photo -- the ones every shop approved
 * before 12 Oct 2026 was never asked for -- or a rider's driving licence, asked
 * of every rider from 13 Oct 2026.
 *
 * The same picker and the same upload path as the application form
 * (`PartnerDocumentFields`, `uploadPartnerDocuments`,
 * `attachApplicationDocuments`), pointed at the application the shop was
 * approved from. The server tells the owner they arrived; a person reads them
 * and marks the shop verified. Nothing here verifies anything.
 *
 * Only the kinds still missing are offered: a shop that sent two of three is
 * asked for the third, not all three again.
 */
export default function PartnerDocumentsPanel({
  applicationId,
  missing,
  forCourier = false,
}: {
  applicationId: string;
  missing: DocumentKind[];
  /** A rider sending a driving licence, rather than a shop. */
  forCourier?: boolean;
}) {
  const locale = useLocale();
  const copy = PARTNER[locale].home.documents;
  const formCopy = APPLY[locale].form;
  const router = useRouter();

  const [files, setFiles] = useState<PickedFiles>({});
  const [problems, setProblems] = useState<Partial<Record<DocumentKind, string>>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<"sent" | "failed" | null>(null);

  const PROBLEM: Record<"wrong-type" | "too-big" | "empty" | "failed", string> = {
    "wrong-type": formCopy.documentWrongType,
    "too-big": formCopy.documentTooBig,
    empty: formCopy.documentEmpty,
    failed: formCopy.documentFailed,
  };

  function pick(kind: DocumentKind, file: File | null) {
    setResult(null);
    setFiles((current) => {
      const next = { ...current };
      if (file) next[kind] = file;
      else delete next[kind];
      return next;
    });
    setProblems((current) => {
      const next = { ...current };
      delete next[kind];
      if (file) {
        const check = checkDocumentFile({ type: file.type, size: file.size });
        if (!check.ok) next[kind] = PROBLEM[check.reason];
      }
      return next;
    });
  }

  const picked = DOCUMENT_KINDS.filter((kind) => missing.includes(kind) && files[kind]).map((kind) => ({ kind, file: files[kind]! }));
  const blocked = picked.length === 0 || Object.keys(problems).length > 0;

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const uploaded = await uploadPartnerDocuments(applicationId, picked);
      if (uploaded.unavailable) {
        setProblems({ [picked[0]?.kind ?? "licence"]: formCopy.documentUnavailable });
        setResult("failed");
        return;
      }
      if (uploaded.failed.length > 0) {
        setProblems((current) => {
          const next = { ...current };
          for (const failure of uploaded.failed) next[failure.kind] = PROBLEM[failure.reason];
          return next;
        });
      }
      if (uploaded.sent.length === 0) {
        setResult("failed");
        return;
      }
      const attached = await attachApplicationDocuments(applicationId, uploaded.sent);
      if (!attached.attached) {
        setResult("failed");
        return;
      }
      setFiles({});
      setResult(uploaded.failed.length === 0 ? "sent" : "failed");
      // The server page decides what is still missing; ask it again.
      router.refresh();
    } catch {
      // A dropped connection mid-upload. The files are still picked.
      setResult("failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-5">
      <PartnerDocumentFields files={files} problems={problems} onChange={pick} disabled={sending} kinds={missing} forCourier={forCourier} />
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" onClick={send} disabled={blocked || sending} className="btn-pill btn-lime px-5 py-2 text-sm disabled:opacity-50">
          {sending ? copy.sending : copy.send}
        </button>
        {result === "sent" && (
          <p role="status" className="text-sm text-muted">
            {copy.sent}
          </p>
        )}
        {result === "failed" && (
          <p role="alert" className="text-sm text-red-600">
            {copy.failed}
          </p>
        )}
      </div>
    </div>
  );
}
