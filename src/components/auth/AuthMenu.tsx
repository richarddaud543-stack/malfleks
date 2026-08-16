"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "@/app/actions/auth";
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
        className={`rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground ${
          compact ? "flex-1 text-center" : ""
        }`}
      >
        Sign in
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
    <div className={`flex items-center gap-2 ${compact ? "flex-1" : ""}`}>
      <Link
        href="/account"
        onClick={onNavigate}
        className={`rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground/75 transition-colors hover:border-foreground/30 hover:text-foreground ${
          compact ? "flex-1 text-center" : ""
        }`}
      >
        {/* The first name only: a nav pill is not the place for
            "Rehema Mwakalinga-Kimaro". The full name is on /account. */}
        {session.name ? session.name.split(" ")[0] : "My account"}
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      <span role="status" className="sr-only">
        {failed ? "Sign out failed. Please try again." : ""}
      </span>
    </div>
  );
}
