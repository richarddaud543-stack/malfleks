import type { EnvSource } from "./config";
import type { Session } from "./dal";

/**
 * Who counts as a Soko admin.
 *
 * Two ways in, and the second one exists because of a genuine chicken-and-egg:
 *
 * 1. **`admin: true` in the user's `app_metadata`**, set out-of-band (Supabase
 *    dashboard, or the Admin API with the service_role key). This is the real
 *    mechanism — central, revocable, and it travels with the user so no extra
 *    lookup is needed. It must be `app_metadata` and never `user_metadata`:
 *    the latter is writable by the user themselves. `dal.ts` says the same
 *    thing at the point of reading, because it only takes one careless edit.
 * 2. **A bootstrap allowlist** in `SOKO_ADMIN_EMAILS`. Nothing in the app can
 *    set the *first* admin flag, and nothing should be able to — an app that
 *    can promote its own users to admin is an app one bug away from letting a
 *    stranger do it. So the first admin is named in config, outside the system
 *    they administer.
 *
 * **The flag has a delay the allowlist does not, and it cuts both ways.** The
 * access token is minted at sign-in and refreshed on a schedule, carrying
 * whatever `app_metadata` said when it was issued.
 *
 * - *Granting* is merely inconvenient: the new admin signs out and back in.
 * - *Revoking* is the dangerous one. Clearing the flag does not invalidate an
 *   access token already in the wild; it stays good until it expires, which is
 *   one hour by default. To end access immediately you must also sign the user
 *   out everywhere — Supabase's Admin API `signOut(jwt, 'global')`, or
 *   revoking their sessions from the dashboard. The runbook in `docs/auth.md`
 *   spells out the pair; this comment exists so nobody discovers it the hard
 *   way.
 *
 * The allowlist is read per request, so it takes effect immediately — which is
 * what makes it the right tool for locking someone out in a hurry.
 *
 * An unverified email is never enough on its own. Google sign-in always returns
 * a verified address, so in practice this only rejects a provider added later
 * that does not.
 */

/**
 * `admin: true` in a user's `app_metadata`.
 *
 * Takes the metadata bag rather than the whole user so the rule can be tested
 * without constructing a Supabase user object — and so no caller is tempted to
 * hand it `user_metadata`, which the user controls.
 */
export function hasAdminFlag(appMetadata: Record<string, unknown>): boolean {
  return appMetadata.admin === true;
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
 * both directions without a browser, a cookie or a Supabase project.
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
