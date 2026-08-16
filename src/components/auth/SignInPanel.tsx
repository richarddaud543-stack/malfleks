"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { signInWithIdToken } from "@/app/actions/auth";
import { invalidateSessionState, useSessionState } from "./session-state";

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
 * The important consequence for this component: it is one provider today and
 * the layer underneath it is provider-agnostic. Adding phone sign-in later is
 * another button that produces an ID token, not a rewrite — everything past
 * `getIdToken()` is identical.
 *
 * `signInWithPopup`, not `signInWithRedirect`: the redirect flow depends on
 * third-party storage on `*.firebaseapp.com`, which Chrome, Safari and Firefox
 * now block. Firebase's own redirect-best-practices page lists switching to
 * popup as the fix for a site not served from its own Firebase Hosting domain,
 * which is us. Popups can be blocked, so that case is handled explicitly rather
 * than left to fail silently.
 */

/** Maps Firebase's error codes to something a customer can act on. */
function messageForCode(code: string): string {
  switch (code) {
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/unauthorized-domain":
      return "Sign-in isn't enabled for this address yet. Please tell us where you saw this.";
    case "auth/network-request-failed":
      return "We couldn't reach Google. Check your connection and try again.";
    default:
      return "Sign-in didn't complete. Please try again.";
  }
}

export const DEFAULT_DESTINATION = "/account";

/**
 * Where to land after sign-in.
 *
 * Anything not a plain same-site path is discarded. `//evil.example` and
 * `https://evil.example` are both valid *values* of a query parameter and both
 * are open redirects — the protocol-relative one especially, because it looks
 * like a path. Backslashes are rejected too: some browsers normalise `/\` to
 * `//`.
 */
export function safeDestination(raw: string | null): string {
  if (!raw) return DEFAULT_DESTINATION;
  if (!raw.startsWith("/")) return DEFAULT_DESTINATION;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_DESTINATION;
  return raw;
}

export default function SignInPanel() {
  const router = useRouter();
  const errorId = useId();
  const session = useSessionState();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = safeDestination(searchParams.get("next"));
  const configured = isFirebaseConfigured();

  // Someone who is already signed in has no business on this page.
  useEffect(() => {
    if (session?.signedIn) router.replace(next);
  }, [session, next, router]);

  async function handleSignIn() {
    setBusy(true);
    setError(null);

    try {
      const { GoogleAuthProvider, signInWithPopup, signOut } = await import(
        "firebase/auth"
      );
      const auth = await getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      // Always show the account chooser. On a shared phone — which is a normal
      // device pattern here — silently reusing the last Google account is how
      // one person's order request lands in another person's account.
      provider.setCustomParameters({ prompt: "select_account" });

      const credential = await signInWithPopup(auth, provider);
      const idToken = await credential.user.getIdToken();

      const result = await signInWithIdToken(idToken);

      // The server session cookie is now the only session. Dropping the client
      // SDK's user leaves exactly one answer to "who is signed in".
      await signOut(auth);

      if (!result.ok) {
        setError(result.message);
        setBusy(false);
        return;
      }

      invalidateSessionState();
      router.replace(next);
      router.refresh();
    } catch (caught) {
      const code =
        typeof caught === "object" && caught !== null && "code" in caught
          ? String((caught as { code: unknown }).code)
          : "";
      setError(messageForCode(code));
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <p className="text-sm text-muted">
          Sign-in isn&apos;t available on this deployment — it has no Firebase
          configuration. You can still place an order request without an
          account; it will be held in this browser tab.
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
        We use your Google account only to keep your order requests. Soko takes
        no payment and asks for nothing else.
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
