"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { safeDestination } from "@/lib/auth-redirect";
import { startGoogleSignIn } from "@/app/actions/auth";
import { useSessionState } from "./session-state";

/**
 * Google sign-in.
 *
 * Why Google and not phone, in a market where the phone number is identity:
 * see docs/auth.md for the full argument. The short version is that phone auth
 * bills per SMS, needs an operator to open a billing account and an SMS region
 * allowlist before it can send a single message, and turns a public sign-in
 * button into a metered spend an attacker controls. Meanwhile 90.6% of mobile
 * browsing in Tanzania happens on Android, where a Google account is part of
 * setting the device up.
 *
 * ## What the move off Firebase removed from this file
 *
 * The popup. Firebase's redirect flow depended on third-party storage on
 * `*.firebaseapp.com`, which Chrome, Safari and Firefox now block, so the only
 * workable option was `signInWithPopup` — and popups bring their own failure
 * modes, each of which needed its own message: blocked by the browser, closed
 * by the user, cancelled by a second request. Then the panel had to mint an ID
 * token, post it to a Server Action, and sign the client SDK back out so that
 * two systems did not both believe they knew who was signed in.
 *
 * Supabase's flow is a plain top-level redirect, so all of that is gone. This
 * component now does one thing: hand a validated destination to a Server Action
 * and let it redirect. No token is ever handled here.
 *
 * Whether sign-in is available is decided by the *server* — the panel is
 * rendered with `configured` as a prop rather than reading an environment
 * variable itself. That is not a style preference: reading it here would make
 * the answer depend on what was inlined into the client bundle at build time,
 * and the server's own view is the one that decides whether sign-in works.
 */

export { DEFAULT_DESTINATION, safeDestination } from "@/lib/auth-redirect";

/** Maps the callback's `?error=` back to something a customer can act on. */
function messageForError(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "cancelled":
      return "Sign-in was cancelled.";
    case "unconfigured":
      return "Signing in isn't available on this deployment yet.";
    default:
      return "Sign-in didn't complete. Please try again.";
  }
}

export default function SignInPanel({ configured }: { configured: boolean }) {
  const router = useRouter();
  const errorId = useId();
  const session = useSessionState();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    messageForError(searchParams.get("error")),
  );

  const next = safeDestination(searchParams.get("next"));

  // Someone who is already signed in has no business on this page.
  useEffect(() => {
    if (session?.signedIn) router.replace(next);
  }, [session, next, router]);

  async function handleSignIn() {
    setBusy(true);
    setError(null);

    // On success this never returns — the action redirects to Google. A
    // returned value therefore always means failure, which is why the result
    // type has no success case.
    const result = await startGoogleSignIn(next);
    setError(result.message);
    setBusy(false);
  }

  if (!configured) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <p className="text-sm text-muted">
          Sign-in isn&apos;t available on this deployment — it has no Supabase
          authentication configuration. You can still place an order request
          without an account; it will be held in this browser tab.
        </p>
        <Link
          href="/search"
          className="btn-pill btn-lime mt-6 px-6 py-2.5 text-sm"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        aria-describedby={error ? errorId : undefined}
        className="btn-pill btn-ink flex w-full items-center justify-center gap-3 px-6 py-3.5 text-sm disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? "Signing in…" : "Continue with Google"}
      </button>

      {/* Always in the DOM so a screen reader announces the message when it
          arrives, rather than the region appearing and being missed. */}
      <p
        id={errorId}
        role="alert"
        className="mt-3 min-h-5 text-sm text-red-600"
      >
        {error ?? ""}
      </p>

      <p className="mt-4 text-sm text-muted">
        We use your Google account to keep your orders, so you can pay for
        them here and track their delivery. MalFleks asks for nothing else.
      </p>

      <p className="mt-6 border-t border-border pt-4 text-sm text-muted">
        You don&apos;t need an account to order.{" "}
        <Link
          href="/search"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Browse products
        </Link>{" "}
        and request one without signing in — it just won&apos;t outlive the tab.
      </p>
    </div>
  );
}

/** Google's mark, inline so it costs no request and no external host. */
function GoogleMark() {
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
