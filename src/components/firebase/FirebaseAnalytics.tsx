"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase";
import { analyticsAllowed } from "@/lib/consent";
import { useConsentState } from "@/components/consent/consent-state";

/**
 * Starts Firebase Analytics in the browser, once, and **only after the visitor
 * has agreed**. Until then this renders nothing and imports nothing: the
 * `firebase/analytics` module is behind a dynamic import inside
 * `initAnalytics`, so a decline costs not just no identifiers but no request
 * and no bytes. See `src/lib/consent.ts` for why the gate is written that way
 * rather than as Google's consent mode.
 *
 * It exists as a component because analytics has to run after hydration —
 * `getAnalytics()` reads `window`, so the console's snippet (which calls it at
 * module scope) crashes a server-rendered page.
 *
 * The effect depends on the decision, so granting consent starts collection
 * immediately rather than on the next page load. Withdrawing does not stop an
 * already-running gtag in this tab — nothing in the SDK unloads it — so the
 * `denied` path is enforced on the next load. That is the honest limit of a
 * client-side gate, and it is why the *default* has to be "off": the state
 * this cannot leave is the one it never enters.
 *
 * Failure is deliberately non-fatal: an ad blocker refusing the request, an
 * unsupported browser, or a missing measurementId should cost the visitor
 * nothing. Analytics is never worth breaking a page over.
 */
export default function FirebaseAnalytics() {
  const { decision } = useConsentState();
  const allowed = analyticsAllowed(decision);

  useEffect(() => {
    if (!allowed) return;

    let cancelled = false;

    initAnalytics()
      .then((analytics) => {
        if (!cancelled && analytics && process.env.NODE_ENV === "development") {
          console.info("[firebase] analytics active");
        }
      })
      .catch((error) => {
        console.warn("[firebase] analytics unavailable:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [allowed]);

  return null;
}
