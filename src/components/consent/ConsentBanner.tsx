"use client";

import { useId } from "react";
import { decideConsent, useConsentState } from "./consent-state";

/**
 * Asks before Firebase Analytics runs. Nothing is collected until it is
 * answered — see `src/lib/consent.ts` for the rule and why declining means
 * "never initialised" rather than Google's consent mode.
 *
 * Design constraints taken from the 2026 regulatory guidance recorded in
 * `docs/research/firebase-security.md`, not from taste:
 *
 *   - **Both buttons are visually identical.** Same size, same weight, same
 *     fill — the only difference is the label. A styled "Allow" beside a plain
 *     text "decline" is the single most-cited dark pattern, and regulators now
 *     treat unequal prominence as no consent at all.
 *   - **Declining is one click on the first layer**, never behind a "manage
 *     preferences" step.
 *   - **It is not a modal.** No focus trap, no scroll lock, no overlay: the
 *     site works fine for someone who ignores it, and refusing to answer is
 *     itself an answer (nothing runs).
 *   - **It is mounted near the top of the DOM** and positioned at the bottom
 *     visually, so a keyboard user reaches it as one of the first tab stops
 *     rather than after every link on the page.
 */
export default function ConsentBanner() {
  const { decision, revisiting, ready } = useConsentState();
  const headingId = useId();
  const bodyId = useId();

  // `ready` is false during SSR and until storage has been read, which is what
  // keeps this out of the server-rendered HTML entirely.
  if (!ready) return null;
  if (decision !== null) return null;

  return (
    <section
      // A region rather than a dialog: `role="dialog"` promises modality and a
      // focus contract this deliberately does not have.
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      data-testid="consent-banner"
      // Bottom-*left* and width-capped, not a full-width bar. Checked on the
      // rendered homepage: a centred full-width banner lands squarely on the
      // hero's two CTAs, so a visitor reaching for "Browse the marketplace"
      // hits this instead. Capping at max-w-md keeps it clear of centred
      // page content on desktop; below `sm` it spans the width, which is the
      // one place a full-width bar is the right shape anyway.
      className="fixed bottom-0 left-0 z-[900] w-full max-w-md p-4 sm:p-5"
    >
      <div className="glass-card flex flex-col gap-4 rounded-2xl p-5">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-base font-medium">
            {revisiting ? "Analytics preferences" : "Can we count your visit?"}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm text-muted">
            We&apos;d use Google Analytics to see which parts of Soko people
            actually use. It stores an identifier in your browser. Nothing is
            sent unless you say yes, and you can change this any time from the
            footer.
          </p>
        </div>

        {/* Identical classes on both, on purpose — see the note above. Allow is
            listed first only because it matches the reading order of the
            question; neither is visually favoured. */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => decideConsent("granted")}
            className={CHOICE_CLASS}
          >
            Allow
          </button>
          <button
            type="button"
            onClick={() => decideConsent("denied")}
            className={CHOICE_CLASS}
          >
            No thanks
          </button>
        </div>
      </div>
    </section>
  );
}

const CHOICE_CLASS =
  "flex-1 rounded-full border border-foreground/25 bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/50";
