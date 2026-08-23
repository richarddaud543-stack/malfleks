import type { EnvSource } from "@/server/firebase/admin-config";
import type { Session } from "./dal";

/**
 * Who counts as a Soko admin.
 *
 * Two ways in, and the second one exists because of a genuine chicken-and-egg:
 *
 * 1. **A Firebase custom claim** (`admin: true`), set out-of-band with the
 *    Admin SDK. This is the real mechanism — central, revocable, and it travels
 *    inside the session cookie so no extra lookup is needed.
 * 2. **A bootstrap allowlist** in `SOKO_ADMIN_EMAILS`. Nothing in the app can
 *    set the *first* custom claim, and nothing should be able to — an app that
 *    can promote its own users to admin is an app one bug away from letting a
 *    stranger do it. So the first admin is named in config, outside the system
 *    they administer.
 *
 * **The claim has a delay the allowlist does not, and it cuts both ways.** A
 * session cookie is minted at sign-in and lives five days, carrying whatever
 * the claims said at that moment.
 *
 * - *Granting* is merely inconvenient: the new admin signs out and back in.
 * - *Revoking* is the dangerous one. Clearing the claim does **not** end an
 *   existing session. `verifySessionCookie(cookie, true)` checks revocation,
 *   but "revoked" means issued before `tokensValidAfterTime`, and only
 *   `revokeRefreshTokens()` moves that timestamp — `setCustomUserClaims()`
 *   leaves it alone. A demoted admin keeps working access until their cookie
 *   expires unless both calls are made. The runbook in `docs/auth.md` spells
 *   out the pair; this comment exists so nobody discovers it the hard way.
 *
 * The allowlist is read per request, so it takes effect immediately — which is
 * what makes it the right tool for locking someone out in a hurry.
 *
 * An unverified email is never enough on its own. Google sign-in always returns
 * a verified address, so in practice this only rejects a provider added later
 * that does not.
 */

/** `admin: true` in the decoded session cookie's custom claims. */
export function hasAdminClaim(claims: Record<string, unknown>): boolean {
  return claims.admin === true;
}

/**
 * Parses `SOKO_ADMIN_EMAILS` — comma-separated, whitespace-tolerant, matched
 * case-insensitively because email local parts are compared that way in
 * practice and an admin who typed their address with a capital should not be
 * silently locked out.
 */
export function adminEmailAllowlist(env: EnvSource = process.env): string[] {
  return (env.SOKO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * The single authorization question, answered from the session alone.
 *
 * Pure and exported so the "who is an admin" rule can be tested exhaustively in
 * both directions without a browser, a cookie or a Firebase project.
 */
export function isAdminUser(
  session: Session | null,
  env: EnvSource = process.env
): boolean {
  if (!session) return false;

  // A claim is proof in itself: it was set by someone holding the service
  // account key, which is a higher bar than owning an email address.
  if (session.admin) return true;

  // The allowlist route additionally insists the address is verified, because
  // it trusts an email string rather than a signed assertion about a uid.
  if (!session.email || !session.emailVerified) return false;
  return adminEmailAllowlist(env).includes(session.email.toLowerCase());
}
