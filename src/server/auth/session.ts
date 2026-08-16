import { cookies } from "next/headers";
import { isAdminConfigured } from "@/server/firebase/admin-config";

/**
 * Session cookies.
 *
 * A Firebase ID token lives an hour and is held in the browser by the client
 * SDK. Neither of those facts helps a server-rendered page: `onAuthStateChanged`
 * does not exist during SSR, so a Server Component has no way to ask the client
 * SDK who is signed in.
 *
 * The answer Google documents for exactly this case is a session cookie. The
 * client signs in, sends its ID token to the server once, and the server mints
 * an `httpOnly` cookie with the Admin SDK. Every request after that is answered
 * from the cookie, server-side, with no client involvement at all.
 *
 * The cookie is a signed JWT that only the Admin SDK can mint and only the
 * Admin SDK can verify. It is not a bearer token the client can read.
 */

export const SESSION_COOKIE_NAME = "soko_session";

/**
 * Five days. Firebase permits 5 minutes to 14 days. Two weeks is a long time
 * to be wrong about who someone is; five days covers a normal shopping week
 * without leaving a stale session lying around on a shared phone, which is a
 * real device pattern in this market.
 */
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * How old a sign-in may be before we refuse to turn it into a session.
 *
 * Google's own guidance: check `auth_time` before minting. Without it, an ID
 * token minted from a stale credential — say one lifted from a device the user
 * walked away from an hour ago — would still buy a fresh five-day session. The
 * client re-authenticates instead.
 */
export const MAX_AUTH_AGE_MS = 5 * 60 * 1000;

/**
 * Whether a sign-in is too old to trade for a session. `authTimeSeconds` is the
 * `auth_time` claim, which Firebase reports in seconds since the epoch — not
 * milliseconds. Getting that wrong makes every sign-in look ancient (or none of
 * them), so it is asserted in the tests rather than assumed.
 */
export function isAuthTimeStale(
  authTimeSeconds: number,
  nowMs: number = Date.now(),
  maxAgeMs: number = MAX_AUTH_AGE_MS
): boolean {
  const ageMs = nowMs - authTimeSeconds * 1000;
  // A negative age means the token claims to have been minted in the future.
  // Treat that as stale too: it is either clock skew or something forged.
  return ageMs < -maxAgeMs || ageMs > maxAgeMs;
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * Cookie attributes, in one place so the sign-out path clears exactly what the
 * sign-in path set — a mismatched `path` leaves an orphan cookie the browser
 * keeps sending forever.
 *
 * `secure` is off only in development, where there is no HTTPS on localhost and
 * a `Secure` cookie would simply never be stored.
 *
 * `sameSite: "lax"` rather than `strict`: `strict` would drop the cookie on the
 * first navigation in from any external link, so a customer arriving from a
 * WhatsApp share would look signed out until they clicked something. `lax`
 * still withholds the cookie from cross-site POSTs, which is the CSRF case that
 * matters.
 */
export function sessionCookieOptions(
  maxAgeMs: number = SESSION_MAX_AGE_MS,
  isProduction: boolean = process.env.NODE_ENV === "production"
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export type CreateSessionResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "stale" | "rejected" };

/**
 * Verifies an ID token and trades it for a session cookie.
 *
 * `verifyIdToken(token, true)` is the revocation-checking form: it costs a
 * round trip to Firebase but catches an account disabled or a token revoked
 * seconds ago, which is the whole point of doing this check at sign-in time.
 */
export async function createSession(
  idToken: string
): Promise<CreateSessionResult> {
  if (!isAdminConfigured()) return { ok: false, reason: "unconfigured" };

  // Dynamic for the same reason as the DAL: this path only runs on an actual
  // sign-in, which is rare compared with rendering a page.
  const { getAdminAuth } = await import("@/server/firebase/admin");
  const auth = getAdminAuth();

  let authTime: number;
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    authTime = decoded.auth_time;
  } catch {
    // Deliberately not surfacing the Firebase error text: it distinguishes
    // "expired" from "malformed" from "wrong project", which is useful to us
    // and useful to someone probing the endpoint.
    return { ok: false, reason: "rejected" };
  }

  if (isAuthTimeStale(authTime)) {
    return { ok: false, reason: "stale" };
  }

  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionCookie, sessionCookieOptions());

  return { ok: true };
}

/**
 * Clears the session, and revokes the underlying refresh tokens so the cookie
 * is dead everywhere rather than merely absent from this browser. Deleting a
 * cookie only stops *this* device presenting it; revocation is what makes
 * "sign out" mean something on a shared handset.
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE_NAME)?.value;

  store.delete({ name: SESSION_COOKIE_NAME, path: "/" });

  if (!existing || !isAdminConfigured()) return;

  try {
    const { getAdminAuth } = await import("@/server/firebase/admin");
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(existing, false);
    await auth.revokeRefreshTokens(decoded.sub);
  } catch {
    // The cookie is already gone from the browser, which is the part the
    // customer can observe. A failed revocation must not turn "sign out" into
    // an error screen.
  }
}
