"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { autoCheckPaymentsAction } from "@/app/actions/reconcile";

/**
 * Asks ClickPesa about stale open payments once the Money page is actually
 * being looked at, then redraws the page if anything was checked.
 *
 * Draws nothing. It exists so the check happens in the browser after the page
 * has appeared, never during rendering -- see the note on `AdminMoneyPage`.
 * The ref makes it once per visit even under React's development double-run.
 */
export default function AutoCheckPayments() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void autoCheckPaymentsAction()
      .then((result) => {
        if (result.changed) router.refresh();
      })
      .catch(() => {
        // The buttons on the page still work; a failed background check is not
        // worth interrupting the admin for. The action logs its own errors.
      });
  }, [router]);

  return null;
}
