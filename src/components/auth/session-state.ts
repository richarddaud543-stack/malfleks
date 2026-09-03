"use client";

import { useEffect, useState } from "react";

/**
 * Client-side view of the server session.
 *
 * Two components need to know whether someone is signed in: the nav, to show
 * the right control, and the order form, to decide whether it may transmit
 * anything at all. That second one is a correctness requirement rather than a
 * cosmetic one — a signed-out customer's name, phone and address must never
 * leave the device — so this asks the server rather than the client SDK.
 *
 * The request is deduplicated at module scope: two mounts on one page make one
 * request, not two.
 *
 * ## Why this is a subscription and not a one-shot effect
 *
 * It used to fetch once on mount, with `invalidateSessionState()` clearing the
 * memo so the *next* reader would see fresh data. That is fine for a component
 * that mounts after the change and useless for one already on screen — which is
 * every component that matters here.
 *
 * Signing out was the bug. `signOut()` cleared the cookie server-side and the
 * memo was dropped, but `AuthMenu` was already mounted: its `useState` survived,
 * its effect had `[]` for dependencies and never ran again, and `router.refresh()`
 * only re-renders Server Components. So the nav went on showing the person's
 * name after they had genuinely been signed out. Pressing the button again did
 * nothing visible, because there was nothing left to do — they were already out.
 *
 * Every reader now subscribes, and invalidation notifies all of them. The fix
 * belongs here rather than in `AuthMenu` because the same staleness applies to
 * the order form: it decides whether it may transmit a customer's address, and
 * it must never make that decision from a session state that has since changed.
 */

export interface SessionState {
  signedIn: boolean;
  name: string | null;
  picture: string | null;
}

export const SIGNED_OUT: SessionState = {
  signedIn: false,
  name: null,
  picture: null,
};

let pending: Promise<SessionState> | null = null;
const listeners = new Set<() => void>();

export function fetchSessionState(): Promise<SessionState> {
  if (!pending) {
    pending = fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : SIGNED_OUT))
      .then((value: unknown) => {
        const data = value as Partial<SessionState>;
        return {
          signedIn: data?.signedIn === true,
          name: typeof data?.name === "string" ? data.name : null,
          picture: typeof data?.picture === "string" ? data.picture : null,
        };
      })
      .catch(() => SIGNED_OUT);
  }
  return pending;
}

/**
 * Drops the memoized answer and tells every mounted reader to ask again.
 *
 * Call it after any change to who is signed in. Notifying is the half that was
 * missing: dropping the memo alone only helps components that mount later.
 */
export function invalidateSessionState(): void {
  pending = null;
  for (const listener of listeners) listener();
}

/**
 * `undefined` while the answer is still in flight, so callers can hold a
 * neutral state rather than flashing "Sign in" at someone who is signed in.
 */
export function useSessionState(): SessionState | undefined {
  const [state, setState] = useState<SessionState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const read = () => {
      fetchSessionState().then((value) => {
        if (!cancelled) setState(value);
      });
    };

    read();
    listeners.add(read);
    return () => {
      cancelled = true;
      listeners.delete(read);
    };
  }, []);

  return state;
}
