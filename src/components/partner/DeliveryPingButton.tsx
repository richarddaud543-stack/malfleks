"use client";

import { useState } from "react";

import { postDeliveryPingAction } from "@/app/actions/tracking";
import { useLocale } from "@/i18n/client";
import { PARTNER, pingNoteLabel } from "@/i18n/copy/partner";
import type { DeliveryPingView } from "@/server/orders/tracking";

type PingCopy = (typeof PARTNER)["en"]["ping"];

/** The courier's own words for where they are. Distinct from `Order.status` —
 *  see the note on `DeliveryPing` in `schema.prisma`. */
const NOTES = ["Picked up", "On the way", "Arrived"] as const;

function timeAgo(iso: string, copy: PingCopy): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return copy.justNow;
  if (minutes < 60) return copy.minutesAgo(minutes);
  return copy.hoursAgo(Math.round(minutes / 60));
}

/**
 * "Update my location" for one order — the partner half of live tracking.
 *
 * Reads the browser's own Geolocation API at the moment the button is
 * tapped (no background permission, no continuous watch — see the note on
 * `DeliveryPing`) and hands the coordinates straight to
 * `postDeliveryPingAction`, which re-derives *whose* order this is from the
 * session rather than trusting anything this component sends besides the id.
 *
 * State here is optimistic only about the ping that action confirms: the
 * displayed "last reported" always reflects what the server actually stored,
 * never a guess made before the round trip finished.
 */
export default function DeliveryPingButton({
  orderId,
  initialPing,
}: {
  orderId: string;
  initialPing: DeliveryPingView | null;
}) {
  const locale = useLocale();
  const copy = PARTNER[locale].ping;
  const [ping, setPing] = useState(initialPing);
  const [status, setStatus] = useState<"idle" | "locating" | "sending" | "error">(
    "idle",
  );
  const [note, setNote] = useState<string>(NOTES[0]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleReport() {
    setErrorMessage(null);

    if (!("geolocation" in navigator)) {
      setStatus("error");
      setErrorMessage(copy.noBrowser);
      return;
    }

    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setStatus("sending");
        try {
          const result = await postDeliveryPingAction(orderId, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            note,
          });
          if (result.ok) {
            setPing(result.ping);
            setStatus("idle");
          } else {
            setStatus("error");
            setErrorMessage(
              result.reason === "not-trackable"
                ? copy.notTrackable
                : result.reason === "rate-limited"
                  ? copy.rate
                  : copy.failed,
            );
          }
        } catch {
          setStatus("error");
          setErrorMessage(copy.failed);
        }
      },
      () => {
        setStatus("error");
        setErrorMessage(
          copy.denied,
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const busy = status === "locating" || status === "sending";

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {ping
            ? `${copy.lastReported(timeAgo(ping.createdAt, copy))}${ping.note ? ` · ${pingNoteLabel(ping.note, locale)}` : ""}`
            : copy.none}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          className="min-h-11 rounded-full border border-border bg-background px-3 py-1.5 text-sm"
        >
          {NOTES.map((label) => (
            <option key={label} value={label}>
              {pingNoteLabel(label, locale)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleReport}
          disabled={busy}
          className="btn-pill btn-ink px-4"
        >
          {status === "locating"
            ? copy.finding
            : status === "sending"
              ? copy.sending
              : copy.update}
        </button>
      </div>

      {errorMessage && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
