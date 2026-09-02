"use client";

import { useState } from "react";

import {
  sendTestNotification,
  type NotificationTestResult,
} from "@/app/actions/notification-test";

/**
 * The state of MalFleks's notifications, and a button that proves it.
 *
 * Shown to admins only. The status line comes from the server so it reflects
 * the deployment rather than what anyone remembers configuring — an
 * environment variable that exists but is empty looks identical to a correct
 * one in the Vercel dashboard, and this project has been caught by that four
 * times.
 *
 * The failure messages name the actual fix. "rejected" is a key or an
 * unverified sender, and it is the answer to the single most likely mistake
 * with Brevo, which will not send from an address you have not verified with
 * the six-digit code it emails you.
 */

const FAILURE: Record<string, { title: string; detail: string }> = {
  forbidden: {
    title: "Not allowed",
    detail: "Your session expired, or this account is no longer an admin.",
  },
  "not-configured": {
    title: "No provider configured",
    detail:
      "Neither BREVO_API_KEY nor RESEND_API_KEY is set on this deployment — or one is set to an empty string, which looks identical in the dashboard. MalFleks is running normally and simply sending nothing.",
  },
  rejected: {
    title: "The provider refused it",
    detail:
      "The key was wrong, expired, or the sender address in NOTIFY_FROM has not been verified with the provider. Brevo will not send from an address you have not confirmed with the six-digit code it emails you.",
  },
  failed: {
    title: "Couldn't reach the provider",
    detail:
      "A network failure between Vercel and the mail API. Nothing is misconfigured as far as we can tell — try again in a moment.",
  },
};

export default function NotificationCheck({
  configured,
  provider,
  to,
}: {
  configured: boolean;
  provider: string | null;
  to: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NotificationTestResult | null>(null);

  return (
    <section
      aria-labelledby="notify-heading"
      className="glass-card mt-12 rounded-2xl px-6 py-5"
    >
      <h2
        id="notify-heading"
        className="font-display text-lg font-medium tracking-tight"
      >
        Notifications
      </h2>

      <p className="mt-2 max-w-prose text-sm text-muted">
        {configured ? (
          <>
            Sending through <strong>{provider}</strong> to{" "}
            <strong>{to}</strong>. You get an email when a business applies and
            when a customer sends an order request.
          </>
        ) : (
          <>
            <strong>Nothing is being sent.</strong> No provider key is set on
            this deployment, so applications and orders will sit in these
            queues until you open them. Everything else works normally.
          </>
        )}
      </p>

      {result?.ok && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          Sent to <strong>{result.to}</strong> via {result.provider}. If it does
          not arrive within a minute or two, check the spam folder — and the
          provider&apos;s own log, which will say whether they accepted it.
        </p>
      )}

      {result && !result.ok && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-sm"
        >
          <p className="font-medium">{FAILURE[result.reason]?.title}</p>
          <p className="mt-1 text-muted">{FAILURE[result.reason]?.detail}</p>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResult(await sendTestNotification());
          setBusy(false);
        }}
        className="btn-pill btn-ink mt-5 px-5 py-2 text-sm disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send a test notification"}
      </button>
    </section>
  );
}
