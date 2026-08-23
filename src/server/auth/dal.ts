import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isAdminConfigured } from "@/server/firebase/admin-config";
import { SESSION_COOKIE_NAME } from "./session";

/**
 * The Data Access Layer.
 *
 * Next's own authentication guide is explicit that Proxy (ex-Middleware) must
 * not be the only line of defence — it runs on prefetches, a matcher edit can
 * silently drop a route out of its coverage, and it is too far from the data to
 * be the thing that decides who may read what. The prescribed shape is one
 * `verifySession()` wrapped in React's `cache()`, called from Server
 * Components, Server Actions and Route Handlers.
 *
 * This is that function. Nothing else in the codebase reads the session cookie
 * directly, and nothing reads a customer's documents without going through
 * `requireSession()` first. There is no `proxy.ts` in this repo, so this is not
 * a second layer behind one — it is the only layer, which is the reason it has
 * to be the authoritative check rather than an optimistic one.
 */

export interface Session {
  uid: string;
  /** Display name from the identity provider. Absent on some Google accounts. */
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  picture: string | null;
  /**
   * The `admin: true` custom claim, if this cookie carries one.
   *
   * Read here rather than looked up per page, because it rides inside the
   * cookie already. The cost is staleness: a claim granted after sign-in does
   * not reach a cookie minted before it, so a newly promoted admin has to sign
   * in again. `isAdminUser()` in `./admin` is the thing to call — it also
   * honours the bootstrap allowlist, which has no such delay.
   */
  admin: boolean;
}

/**
 * Who is signed in, or `null`.
 *
 * `verifySessionCookie(cookie, true)` is the revocation-checking form. It costs
 * a network round trip to Firebase per render pass, which is exactly why this
 * is wrapped in `cache()` — a page that renders the nav, the account list and a
 * summary would otherwise make three identical calls. `cache()` memoizes for
 * one render pass only, so the check still happens once per request.
 *
 * Returning `null` rather than throwing is deliberate: most callers want to
 * render a signed-out variant, not an error.
 */
export const verifySession = cache(async (): Promise<Session | null> => {
  if (!isAdminConfigured()) return null;

  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    // Loaded here rather than at module scope: the Admin SDK pulls in gRPC and
    // protobuf, and a signed-out visitor — which is most of them — has already
    // returned above without needing any of it. Importing it eagerly made the
    // first request to /api/auth/session slow enough to be flaky.
    const { getAdminAuth } = await import("@/server/firebase/admin");
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      name: typeof decoded.name === "string" ? decoded.name : null,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      picture: typeof decoded.picture === "string" ? decoded.picture : null,
      admin: decoded.admin === true,
    };
  } catch {
    // Expired, revoked, tampered with, or minted for another project. All of
    // them mean the same thing to a caller: nobody is signed in.
    return null;
  }
});

/**
 * The session, or a redirect to sign-in. For pages and actions that genuinely
 * cannot proceed without a user.
 *
 * `redirect()` throws, so this never returns `null` and callers do not need a
 * null check — that is the point of having it separate from `verifySession`.
 *
 * `next` is where sign-in returns the visitor. It used to be hardcoded to
 * `/account`, which was correct only because `/account` was the sole caller:
 * the second gated route to use this would have silently sent its visitors to
 * somebody else's page after signing in. `SignInPanel` validates the value
 * against open redirects, so a caller cannot use this to bounce anyone
 * off-site.
 */
export async function requireSession(next: string = "/account"): Promise<Session> {
  const session = await verifySession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session;
}

/**
 * The session, or gone — for admin-only routes and actions.
 *
 * A signed-out visitor is sent to sign in, because that is recoverable. A
 * signed-in non-admin gets `notFound()` rather than a redirect or a 403: a
 * "you are not allowed here" page confirms the route exists, and an admin
 * console is worth strictly less to an attacker who cannot tell it is there.
 * The same reasoning is why /admin is `noindex` and absent from the sitemap.
 *
 * Authorization lives here, in the DAL, next to the data — not in a proxy that
 * a matcher edit could quietly stop covering.
 */
export async function requireAdmin(next: string = "/admin"): Promise<Session> {
  const session = await verifySession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  const { isAdminUser } = await import("./admin");
  if (!isAdminUser(session)) notFound();

  return session;
}
