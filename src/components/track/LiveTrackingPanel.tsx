"use client";

import { useEffect, useState } from "react";

import {
  fetchCustomerTrackingAction,
  type TrackedOrderSummary,
} from "@/app/actions/tracking";
import OrderTrackingMap from "@/components/locator/OrderTrackingMap";
import { useLocale } from "@/i18n/client";
import { ACCOUNT } from "@/i18n/copy/account";
import { pingNoteLabel } from "@/i18n/copy/partner";

type TrackCopy = (typeof ACCOUNT)["en"]["track"];

/** How often the panel re-asks the server for the newest ping. Cheap enough
 *  at this table's real volume (see the note on `latestPingsForOrders`) and
 *  frequent enough that "live" isn't a stretch for a manual-ping system. */
const POLL_MS = 20_000;


function timeAgo(iso: string, copy: TrackCopy): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return copy.justNow;
  if (minutes < 60) return copy.minutesAgo(minutes);
  return copy.hoursAgo(Math.round(minutes / 60));
}

/**
 * Polls `fetchCustomerTrackingAction` while an order is worth polling, and
 * renders the newest reported position on `OrderTrackingMap`.
 *
 * Polling stops once the order reaches `cancelled` or `fulfilled` — both are
 * terminal in `status.ts`'s workflow, so nothing will ever post another ping,
 * and a tab left open on a delivered order should not keep quietly calling
 * the server forever. It also stops on a fetch failure rather than retrying
 * in a tight loop: a `not-found` here would mean the order stopped being this
 * customer's between renders, which should not happen, but the alternative —
 * retrying against a `notFound()` you already rendered around — is worse.
 */
export default function LiveTrackingPanel({
  reference,
  initialOrder,
}: {
  reference: string;
  initialOrder: TrackedOrderSummary;
}) {
  const locale = useLocale();
  const copy = ACCOUNT[locale].track;
  const [order, setOrder] = useState(initialOrder);
  const [stalled, setStalled] = useState(false);

  const isTerminal = order.status === "cancelled" || order.status === "fulfilled";

  // Re-runs whenever `order.status` changes, which is what lets this stop
  // polling the instant a fetch reports a terminal status — the effect
  // itself just declines to start a new interval rather than needing a ref
  // to read state that render already has.
  useEffect(() => {
    if (isTerminal) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      const result = await fetchCustomerTrackingAction(reference);
      if (cancelled) return;

      if (!result.ok) {
        setStalled(true);
        clearInterval(interval);
        return;
      }

      setOrder(result.order);
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reference, isTerminal]);

  const latest = order.pings[0] ?? null;

  return (
    <div className="glass-card mt-8 rounded-2xl px-6 py-6">
      <p className="text-sm text-muted">
        {(copy.status as Record<string, string>)[order.status] ?? copy.statusOther(order.status)}
      </p>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <OrderTrackingMap
          position={
            latest ? { lat: latest.latitude, lng: latest.longitude } : null
          }
        />
      </div>

      <p className="mt-3 text-xs text-muted">
        {latest
          ? `${copy.lastReported(timeAgo(latest.createdAt, copy))}${latest.note ? ` · ${pingNoteLabel(latest.note, locale)}` : ""}`
          : order.status === "confirmed"
            ? copy.waitingFirst
            : copy.noLocation}
      </p>

      {stalled && (
        <p className="mt-3 text-xs text-red-700 dark:text-red-400">
          {copy.stalled}
        </p>
      )}
    </div>
  );
}
