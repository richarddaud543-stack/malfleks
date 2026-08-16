import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
 */
export async function requireSession(): Promise<Session> {
  const session = await verifySession();
  if (!session) redirect("/sign-in?next=/account");
  return session;
}
