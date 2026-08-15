"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase";

/**
 * Starts Firebase Analytics in the browser, once.
 *
 * Renders nothing. It exists as a component only because analytics has to run
 * after hydration — `getAnalytics()` reads `window`, so the console's snippet
 * (which calls it at module scope) crashes a server-rendered page.
 *
 * Failure here is deliberately non-fatal: an ad blocker refusing the request,
 * an unsupported browser, or a missing measurementId should cost the visitor
 * nothing. Analytics is never worth breaking a page over.
 */
export default function FirebaseAnalytics() {
  useEffect(() => {
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
  }, []);

  return null;
}
