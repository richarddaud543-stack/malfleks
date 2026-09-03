"use client";

import { useEffect, useState } from "react";

/**
 * The signed-in account's standing with MalFleks, read client-side.
 *
 * Client-side for the same reason the nav reads its session that way:
 * `/apply` must stay statically prerendered to remain indexable, so nothing in
 * its render may await cookies. See the note at the top of `apply/page.tsx`.
 *
 * Deliberately *not* memoized at module scope the way `session-state` is. That
 * cache exists because several components ask the same question on one page;
 * here there is one reader, and the answer changes the moment someone submits
 * an application — a stale "none" would show them a blank form seconds after
 * they filled one in.
 */

export type PartnerStatus =
  | { state: "unknown" }
  | { state: "signed-out" }
  | { state: "none" }
  | { state: "pending"; submittedAt: string }
  | { state: "rejected"; reviewedAt: string | null }
  | { state: "partner"; live: boolean; kind: string };

const UNKNOWN: PartnerStatus = { state: "unknown" };

function parse(value: unknown): PartnerStatus {
  const data = value as { state?: unknown; live?: unknown; kind?: unknown } & Record<
    string,
    unknown
  >;

  switch (data?.state) {
    case "signed-out":
    case "none":
      return { state: data.state };
    case "pending":
      return {
        state: "pending",
        submittedAt: typeof data.submittedAt === "string" ? data.submittedAt : "",
      };
    case "rejected":
      return {
        state: "rejected",
        reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
      };
    case "partner":
      return {
        state: "partner",
        live: data.live === true,
        kind: typeof data.kind === "string" ? data.kind : "brand",
      };
    default:
      return UNKNOWN;
  }
}

/**
 * `undefined` while in flight. `signedIn` gates the request: there is no point
 * asking who someone is when the nav already knows nobody is signed in, and
 * re-asking when it changes is what makes this correct after a sign-in.
 */
export function usePartnerStatus(signedIn: boolean | undefined): PartnerStatus | undefined {
  const [fetched, setFetched] = useState<PartnerStatus | undefined>(undefined);

  useEffect(() => {
    // Nothing to ask about: the two non-fetching answers are derived below,
    // during render. Setting them in here instead would be a synchronous
    // setState inside an effect — a cascading render, and something React's
    // own lint rule rightly objects to.
    if (!signedIn) return;

    let cancelled = false;
    fetch("/api/partner/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : UNKNOWN))
      .then((value) => {
        if (!cancelled) setFetched(parse(value));
      })
      .catch(() => {
        // Failing to "unknown" makes the form show itself, which is what
        // happened before this existed. Never block an application on it.
        if (!cancelled) setFetched(UNKNOWN);
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Derived rather than stored, so signing out is reflected immediately and
  // a stale fetched answer can never outlive the session it belonged to.
  if (signedIn === undefined) return undefined;
  if (!signedIn) return { state: "signed-out" };
  return fetched;
}
