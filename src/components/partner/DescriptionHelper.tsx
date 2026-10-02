"use client";

import { useState, useTransition } from "react";

import { draftDescriptionAction, type DraftDescriptionResult } from "@/app/actions/partner-ai";

const MESSAGES: Record<Exclude<DraftDescriptionResult, { ok: true }>["reason"], string> = {
  "signed-out": "Your session expired. Sign in again and retry.",
  unavailable: "Writing help isn't available right now. Write it in your own words.",
  "not-a-partner": "Writing help is for active partners only.",
  "rate-limited": "That's a lot of drafts in one hour. Try again later, or write it in your own words.",
  "not-enough": "Add a few facts first — type some notes above, add a detail, or add a photo — then try again.",
  "provider-failed": "We couldn't write a draft just now. Try again in a moment.",
};

/**
 * "Help me write this" — a draft description the partner reads before using.
 *
 * Only drawn when the deployment has a key for it (the page passes that
 * down), so on a site without one this component is never mounted.
 *
 * The draft is shown in its own box and goes into the form only when the
 * partner presses "Use this". That step is the point: the shopkeeper is the
 * one who knows the item, the draft is written from what they typed and
 * nothing else, and a description they did not read is one nobody checked.
 */
export default function DescriptionHelper({
  facts,
  onUse,
}: {
  /** Read at the moment the button is pressed, so the draft is from what is in the form now. */
  facts: () => { name: string; category: string; notes: string; specs: { key: string; value: string }[]; photoUrl: string | null };
  onUse: (description: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ask() {
    setError(null);
    startTransition(async () => {
      const result = await draftDescriptionAction(facts());
      if (result.ok) setDraft(result.description);
      else setError(MESSAGES[result.reason]);
    });
  }

  return (
    <div className="mt-2">
      {draft === null && (
        <button
          type="button"
          onClick={ask}
          disabled={pending}
          className="min-h-11 rounded-full border border-foreground/20 px-4 text-sm font-medium transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {pending ? "Writing a draft…" : "Help me write this"}
        </button>
      )}
      {draft === null && !pending && !error && (
        <p className="mt-1.5 text-xs text-muted">
          Writes a draft from the name, details, photo and any notes you have typed. It only uses what you gave it.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {draft !== null && (
        <div role="group" aria-label="Suggested description" className="rounded-xl border border-foreground/15 bg-surface-2 p-4">
          <p className="text-xs font-medium text-muted">Suggested description — read it before you use it</p>
          <p className="mt-2 whitespace-pre-line text-sm" data-testid="description-draft">
            {draft}
          </p>
          <p className="mt-3 text-xs text-muted">
            This was written by AI from what you typed. You are the one who knows the item: if anything here is not true of it,
            don&apos;t use it, or correct it after.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onUse(draft);
                setDraft(null);
              }}
              className="min-h-11 rounded-full border border-accent bg-accent px-4 text-sm font-medium text-background"
            >
              Use this
            </button>
            <button
              type="button"
              onClick={ask}
              disabled={pending}
              className="min-h-11 rounded-full border border-foreground/20 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "Writing…" : "Try another"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="min-h-11 rounded-full px-4 text-sm text-muted hover:text-foreground">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
