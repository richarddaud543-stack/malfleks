"use client";

import { useSyncExternalStore } from "react";
import {
  clearConsent,
  readConsent,
  writeConsent,
  type ConsentDecision,
} from "@/lib/consent";

/**
 * Client-side view of the analytics consent decision.
 *
 * Three components need it and none of them are near each other in the tree —
 * the banner that asks, the mount point that starts Analytics, and the footer
 * link that lets someone change their mind — so this is a module-scope store
 * rather than a context provider threaded through the root layout. Same shape
 * as `session-state.ts`, for the same reason.
 */

export interface ConsentState {
  /** `null` until the visitor chooses. */
  decision: ConsentDecision | null;
  /** True when someone reopened the choice after already answering. */
  revisiting: boolean;
  /**
   * False until storage has been read in the browser. The banner waits for
   * this: rendering it during SSR would both mismatch on hydration and flash
   * at people who settled this months ago.
   */
  ready: boolean;
}

const INITIAL: ConsentState = {
  decision: null,
  revisiting: false,
  ready: false,
};

// One frozen object per state, because useSyncExternalStore compares snapshots
// by identity — returning a fresh object per call would re-render forever.
let state: ConsentState = INITIAL;

const listeners = new Set<() => void>();

function set(next: ConsentState): void {
  state = next;
  for (const listener of listeners) listener();
}

function storage(): Storage | null {
  // Accessing `localStorage` itself can throw where site data is blocked, so
  // even the lookup is guarded, not just the read.
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void): () => void {
  // First subscriber reads storage; later ones join the answer already found.
  if (!state.ready) {
    set({ decision: readConsent(storage()), revisiting: false, ready: true });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
/** The server knows nothing about this browser, so it renders the neutral state. */
const getServerSnapshot = () => INITIAL;

export function useConsentState(): ConsentState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Records the visitor's answer and closes the banner. */
export function decideConsent(decision: ConsentDecision): void {
  writeConsent(storage(), decision);
  set({ decision, revisiting: false, ready: true });
}

/**
 * Reopens the question for someone who already answered. Withdrawing has to be
 * as easy as granting, so this is reachable from the footer on every page.
 *
 * The stored value is dropped as well as the in-memory one: if the visitor
 * closes the tab without re-answering, the next visit asks rather than
 * quietly keeping a consent they were in the middle of withdrawing.
 */
export function reopenConsent(): void {
  clearConsent(storage());
  set({ decision: null, revisiting: true, ready: true });
}

/** Test-only: drops module state so each case starts as a fresh visitor. */
export function resetConsentStateForTests(): void {
  set(INITIAL);
}
