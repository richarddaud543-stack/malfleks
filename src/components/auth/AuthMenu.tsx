"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import { useLocale } from "@/i18n/client";
import { CHROME } from "@/i18n/copy/chrome";
import { invalidateSessionState, useSessionState } from "./session-state";

/**
 * The nav's auth control: "Sign in", or the account link and a way out.
 *
 * Renders a stable-width placeholder while the session is still unknown, so the
 * nav pill does not jump once the answer arrives. Layout shift in a sticky
 * header is the kind of thing that reads as a broken site.
 */
export default function AuthMenu({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  /** Lets the mobile menu close itself when a link here is followed. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const session = useSessionState();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const copy = CHROME[useLocale()].auth;

  if (session === undefined) {
    return (
      <span
        aria-hidden="true"
        className={`h-8 rounded-full bg-foreground/5 ${compact ? "flex-1" : "w-20"}`}
      />
    );
  }

  if (!session.signedIn) {
    return (
      <Link
        href="/sign-in"
        onClick={onNavigate}
        className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground ${
          compact ? "flex-1 text-center" : ""
        }`}
      >
        {copy.signIn}
      </Link>
    );
  }

  function handleSignOut() {
    setFailed(false);
    startTransition(async () => {
      try {
        await signOut();
        invalidateSessionState();
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className={`relative flex items-center gap-2 ${compact ? "flex-1 flex-wrap" : ""}`}>
      <Link
        href="/account"
        onClick={onNavigate}
        className={`inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground ${
          compact ? "flex-1 text-center" : ""
        }`}
      >
        {/* The first name only: a nav pill is not the place for
            "Rehema Mwakalinga-Kimaro". The full name is on /account. */}
        {session.name ? copy.ordersFor(session.name.split(" ")[0]) : copy.myOrders}
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className="min-h-11 whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-60"
      >
        {pending ? copy.signingOut : copy.signOut}
      </button>
      {/* Visible, not only announced. This used to be `sr-only`, so a sighted
          customer pressed "Sign out", saw the button go back to "Sign out",
          and had no way to know they were still signed in — on a shared
          phone that is the wrong thing to be unsure about. The region is
          always mounted so a screen reader hears the text arrive; it only
          takes up space once there is something in it. In the desktop pill it
          hangs below the control so the nav does not change width; in the
          mobile menu it takes its own row. */}
      <span
        role="alert"
        className={
          failed
            ? compact
              ? "w-full text-sm text-red-700 dark:text-red-400"
              : "absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-xl border border-red-600/40 bg-background px-3 py-1.5 text-xs text-red-700 shadow-sm dark:text-red-400"
            : "sr-only"
        }
      >
        {failed ? copy.signOutFailed : ""}
      </span>
    </div>
  );
}
