"use client";

import { useState } from "react";

import { postDeliveryPingAction } from "@/app/actions/tracking";
import type { DeliveryPingView } from "@/server/orders/tracking";

/** The courier's own words for where they are. Distinct from `Order.status` —
 *  see the note on `DeliveryPing` in `schema.prisma`. */
const NOTES = ["Picked up", "On the way", "Arrived"] as const;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
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
      setErrorMessage("This browser can't share your location.");
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
                ? "This order can no longer take a location update."
                : "Couldn't send that. Try again in a moment.",
            );
          }
        } catch {
          setStatus("error");
          setErrorMessage("Couldn't send that. Try again in a moment.");
        }
      },
      () => {
        setStatus("error");
        setErrorMessage(
          "Location wasn't shared — check your browser's permission for this site.",
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
            ? `Last reported ${timeAgo(ping.createdAt)}${ping.note ? ` · ${ping.note}` : ""}`
            : "No location reported yet"}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
        >
          {NOTES.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleReport}
          disabled={busy}
          className="btn-pill btn-ink px-4 py-1.5 text-xs disabled:opacity-60"
        >
          {status === "locating"
            ? "Finding you…"
            : status === "sending"
              ? "Sending…"
              : "Update my location"}
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
