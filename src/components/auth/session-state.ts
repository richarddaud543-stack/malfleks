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

/** Drops the memoized answer, so the next read reflects a sign-in or sign-out. */
export function invalidateSessionState(): void {
  pending = null;
}

/**
 * `undefined` while the answer is still in flight, so callers can hold a
 * neutral state rather than flashing "Sign in" at someone who is signed in.
 */
export function useSessionState(): SessionState | undefined {
  const [state, setState] = useState<SessionState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchSessionState().then((value) => {
      if (!cancelled) setState(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
