"use client";

import { reopenConsent, useConsentState } from "./consent-state";

/**
 * The withdraw path, in the footer of every page.
 *
 * Consent has to be as easy to take back as it was to give, so this is a plain
 * button in the site's own footer navigation rather than a line buried in a
 * policy page. It reports the current state in its own label — someone
 * checking "what did I agree to?" gets the answer without clicking.
 *
 * Renders nothing until the store has read storage, which keeps it out of the
 * server HTML and avoids a hydration mismatch on a label that depends entirely
 * on this browser's stored value.
 */
export default function ConsentPreferencesButton() {
  const { decision, ready } = useConsentState();

  if (!ready) return null;

  const label =
    decision === "granted"
      ? "Analytics: allowed"
      : decision === "denied"
        ? "Analytics: off"
        : "Analytics: not set";

  return (
    <button
      type="button"
      onClick={reopenConsent}
      data-testid="consent-preferences"
      className="text-left transition-colors hover:text-foreground"
    >
      {label}
      <span className="sr-only"> — change your analytics choice</span>
    </button>
  );
}
