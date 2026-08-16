"use client";

import { useEffect } from "react";
import { initAppCheck } from "@/lib/firebase";

/**
 * Starts Firebase App Check in the browser, once.
 *
 * Renders nothing, and is mounted *before* anything that talks to Firebase so
 * the attestation token exists by the time the first protected call is made.
 * In practice sign-in is a user click many seconds later, so the ordering is
 * comfortable rather than tight — but the ordering is the reason this is its
 * own component rather than a line inside another one.
 *
 * It is separate from `FirebaseAnalytics` on purpose. That component owns a
 * different question (debt #15, the consent gate) and mixing an abuse control
 * into it would tangle two unrelated decisions in one file.
 *
 * Failure is non-fatal. With no site key configured `initAppCheck()` returns
 * `null` and the site behaves exactly as it did before App Check existed.
 */
export default function FirebaseAppCheck() {
  useEffect(() => {
    initAppCheck().catch((error) => {
      // A blocked reCAPTCHA script, an offline device, an unregistered domain.
      // None of them should cost a visitor the page.
      console.warn("[firebase] App Check unavailable:", error);
    });
  }, []);

  return null;
}
