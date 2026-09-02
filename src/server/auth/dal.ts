import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { isAuthConfigured } from "./config";

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
 * This is that function. Nothing else in the codebase reads the auth cookies
 * directly, and nothing reads a customer's saved requests without going through
 * `requireSession()` first. There is no `proxy.ts` in this repo, so this is not
 * a second layer behind one — it is the only layer, which is the reason it has
 * to be the authoritative check rather than an optimistic one.
 *
 * The shape survived the move from Firebase to Supabase unchanged, which was
 * the point of having it: `/account`, `/admin`, the partner review queue and
 * every server action calling `verifySession()` did not have to be rewritten.
 */

export interface Session {
  /** Supabase's user id — a UUID. Stored on rows this customer owns. */
  uid: string;
  /** Display name from the identity provider. Absent on some Google accounts. */
  name: string | null;
  email: string | null;
  emailVerified: boolean;
  picture: string | null;
  /**
   * The `admin: true` flag from **`app_metadata`**, if this user carries one.
   *
   * `app_metadata` is the only half of a Supabase user that a user cannot write.
   * `user_metadata` is populated from whatever the client passes at sign-up and
   * is editable afterwards by the user themselves — reading an admin flag from
   * there would let anyone with an account promote themselves by calling
   * `updateUser({ data: { admin: true } })`. This is the single most important
   * line in the file.
   */
  admin: boolean;
}

/** Narrowing helper: `app_metadata` and the metadata bags are loosely typed. */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Who is signed in, or `null`.
 *
 * **`getUser()`, never `getSession()`.** `getSession()` decodes the cookie and
 * returns what it says, without checking that anyone legitimate wrote it — fine
 * in a browser where the cookie came from local storage the app itself
 * populated, and worthless on a server where the cookie is attacker-supplied
 * input. `getUser()` sends the token to the Supabase auth server, which
 * validates the signature and tells us whether the user still exists. That
 * round trip is precisely the thing being paid for.
 *
 * It is also why this is wrapped in `cache()` — a page rendering the nav, the
 * account list and a summary would otherwise make three identical calls.
 * `cache()` memoizes for one render pass only, so the check still happens once
 * per request.
 *
 * Returning `null` rather than throwing is deliberate: most callers want to
 * render a signed-out variant, not an error.
 */
export const verifySession = cache(async (): Promise<Session | null> => {
  if (!isAuthConfigured()) return null;

  // Imported here rather than at module scope so a signed-out visitor — which
  // is most of them — never constructs a client or touches the cookie jar.
  const { createServerSupabase } = await import("./supabase");
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const user = data.user;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

    return {
      uid: user.id,
      // Google returns `full_name`; email sign-up returns nothing at all.
      name: stringOrNull(meta.full_name) ?? stringOrNull(meta.name),
      email: user.email ?? null,
      // Supabase sets `email_confirmed_at` when the address is proven, either
      // by a confirmation link or by an OAuth provider that vouches for it.
      emailVerified: Boolean(user.email_confirmed_at),
      picture: stringOrNull(meta.avatar_url) ?? stringOrNull(meta.picture),
      admin: appMeta.admin === true,
    };
  } catch {
    // Network failure reaching the auth server, an expired refresh token, a
    // cookie minted for another project. All of them mean the same thing to a
    // caller: nobody is signed in.
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
  // Host before session, and the order is the point. Once `SOKO_ADMIN_HOST` is
  // set, the console does not exist on the public site at all — so a visitor
  // who types /admin there must get a 404 *without* first being bounced to
  // sign-in, because that bounce is itself the answer they were fishing for.
  // Unset, this is true everywhere and nothing changes. See lib/admin-host.ts.
  const { adminRoutesAvailable } = await import("./host");
  if (!(await adminRoutesAvailable())) notFound();

  const session = await verifySession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  const { isAdminUser } = await import("./admin");
  if (!isAdminUser(session)) notFound();

  return session;
}
