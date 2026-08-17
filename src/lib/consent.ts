/**
 * Analytics consent policy.
 *
 * Kept apart from React and from Firebase so the rule — *nothing is collected
 * until the visitor says yes* — can be tested on its own, and so there is one
 * answer to "has this person agreed", not one per component that asks.
 *
 * Why a gate exists at all: Firebase Analytics sets identifiers in the browser
 * on load. Tanzania's Personal Data Protection Act No. 11 of 2022 (in force
 * 1 May 2023) requires consent that is specific, informed and freely given,
 * and Soko's site is reachable well outside Tanzania. See
 * `docs/research/firebase-security.md` for the sources.
 *
 * Why the gate is "do not initialise" rather than Google's consent mode:
 * consent mode's `denied` state still sends cookieless pings, so "denied"
 * there means *less* data, not *no* data. Declining here means the Analytics
 * module is never imported and no request is made at all.
 */

export type ConsentDecision = "granted" | "denied";

/**
 * Namespaced like every other Soko browser key (`soko:order-request`). The
 * `v1` suffix is deliberate: if what we ask consent *for* ever widens, the key
 * changes and every visitor is asked again, rather than a new purpose
 * inheriting an old yes.
 */
export const CONSENT_STORAGE_KEY = "soko:analytics-consent:v1";

/**
 * A stored value, or `null` for "not decided yet". Anything unrecognised —
 * a hand-edited value, a key from a future build — reads as undecided, which
 * fails closed: the visitor is asked again rather than silently opted in.
 */
export function parseConsent(raw: string | null | undefined): ConsentDecision | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/** Narrow shape so tests can pass a plain object instead of faking `Storage`. */
export type ConsentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Reads the stored decision. Storage can throw outright — Safari in private
 * mode, or a browser configured to block site data — and a visitor whose
 * browser refuses storage must still get a working site, so a throw is treated
 * as "undecided" rather than propagated.
 */
export function readConsent(storage: ConsentStorage | null | undefined): ConsentDecision | null {
  if (!storage) return null;
  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Records a decision. Returns whether it actually persisted — a browser that
 * refuses storage will re-ask on the next visit, and the caller is told so
 * rather than assuming the answer stuck.
 */
export function writeConsent(
  storage: ConsentStorage | null | undefined,
  decision: ConsentDecision
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(CONSENT_STORAGE_KEY, decision);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the decision, so the visitor is asked again. */
export function clearConsent(storage: ConsentStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Nothing to do: the decision was never durable in the first place.
  }
}

/** The single question every caller should ask before touching Analytics. */
export function analyticsAllowed(decision: ConsentDecision | null): boolean {
  return decision === "granted";
}
