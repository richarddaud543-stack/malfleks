"use client";

import { useState } from "react";

import { markShopVerifiedAction } from "@/app/actions/admin-console";
import { viewApplicationDocument } from "@/app/actions/partner-review";
import ActionForm from "@/components/admin/ActionForm";
import { Card } from "@/components/admin/ui";

const LABELS: Record<string, string> = {
  licence: "Business licence",
  tin: "TIN certificate",
  shopfront: "Shop front",
};

export interface ShopDocumentsCardProps {
  partnerId: string;
  displayName: string;
  /** ISO, or null while unverified. */
  verifiedAt: string | null;
  verifiedWhen: string | null;
  missing: string[];
  documents: { id: string; kind: string; uploadedWhen: string; aiVerdict: string | null; aiNotes: string | null }[];
  /** "14 October 2026" while the verification rule is waiting on this shop. */
  deadline: string | null;
  hiddenByRule: boolean;
}

/**
 * A shop's three documents on its console page, and the one button that makes
 * it "verified" on the site. The button stays away until all three are here --
 * the server refuses too, but a button that cannot work should not be offered.
 *
 * Links are fetched on click, never rendered into the page: the same reasoning
 * as the review queue's paperwork panel.
 */
export default function ShopDocumentsCard(props: ShopDocumentsCardProps) {
  const [opening, setOpening] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function open(documentId: string) {
    setOpening(documentId);
    setLinkError(null);
    try {
      const outcome = await viewApplicationDocument(documentId);
      if (!outcome.ok) {
        setLinkError(outcome.reason === "unavailable" ? "That link could not be created. Check the partner-documents bucket allows admin reads." : "That document is no longer there.");
        return;
      }
      window.open(outcome.url, "_blank", "noopener,noreferrer");
    } catch {
      setLinkError("Couldn't reach the server. Try again.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Documents</h2>
      {props.verifiedAt ? (
        <p className="mt-1 text-xs text-muted">Checked {props.verifiedWhen}. Customers see this shop as verified.</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Not verified yet — customers don&apos;t see the &ldquo;Verified shop&rdquo; mark.
          {props.hiddenByRule
            ? " Its products are hidden until you mark these checked."
            : props.deadline
              ? ` Its products will be hidden on ${props.deadline} if the documents aren't all here.`
              : ""}
        </p>
      )}

      {props.missing.length > 0 && <p className="mt-2 text-sm text-amber-700">Missing: {props.missing.map((k) => LABELS[k] ?? k).join(", ")}.</p>}

      {props.documents.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {props.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{LABELS[d.kind] ?? d.kind}</span>
              <span className="text-xs text-muted">{d.uploadedWhen}</span>
              {d.aiVerdict && d.aiVerdict !== "pass" ? <span className="w-full text-xs text-amber-700">{d.aiNotes || d.aiVerdict}</span> : null}
              <button
                type="button"
                onClick={() => open(d.id)}
                disabled={opening === d.id}
                className="ml-auto rounded-full border border-border px-3 py-1 text-xs font-medium disabled:opacity-60"
              >
                {opening === d.id ? "Opening…" : "Open"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {linkError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {linkError}
        </p>
      )}

      {!props.verifiedAt && props.missing.length === 0 && (
        <ActionForm
          className="mt-3"
          action={markShopVerifiedAction}
          hidden={{ partnerId: props.partnerId }}
          label="Documents checked"
          tone="primary"
          confirm={`You have opened all three and the names and TIN match ${props.displayName}?`}
          confirmLabel="Yes, they're in order"
        />
      )}
    </Card>
  );
}
