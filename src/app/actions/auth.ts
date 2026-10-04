"use server";

import { ACCOUNT } from "@/i18n/copy/account";
import { chosenLocale } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeDestination } from "@/lib/auth-redirect";
import { isAuthConfigured } from "@/server/auth/config";
import { createServerSupabase } from "@/server/auth/supabase";

/**
 * Sign-in and sign-out, as Server Actions.
 *
 * These are Server Actions rather than Route Handlers for one reason worth
 * stating: Next verifies the Origin against the Host on every Server Action
 * invocation and rejects the mismatch. A hand-rolled POST endpoint would need
 * that check written and, more to the point, remembered.
 *
 * ## What the move to Supabase simplified
 *
 * The Firebase version had the browser sign in with a popup, mint an ID token,
 * post that token to a Server Action, exchange it for a session cookie, and
 * then explicitly `signOut()` the client SDK — because otherwise two different
 * things both believed they knew who was signed in, and they could disagree.
 *
 * None of that survives. Supabase's OAuth flow is a plain redirect: this action
 * asks for a URL, the browser goes to Google, Google returns to
 * `/auth/callback`, and the callback trades the code for cookies. There is one
 * source of truth the whole way through, and no token is ever handled by our
 * own client code.
 *
 * It also removed the popup failure modes the old panel had to name one by one
 * — blocked popups, closed popups, third-party storage being blocked on
 * `*.firebaseapp.com`. A redirect has none of them.
 */

/**
 * The origin OAuth should come back to.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set, and setting it is the recommendation.
 * The fallback reads the forwarded host, which is what Vercel provides — but a
 * `Host` header is client-supplied, so trusting it to build a redirect target
 * is the shape of a Host-header injection. Two things keep that honest here:
 * Supabase refuses any `redirectTo` that is not in the project's own redirect
 * allowlist, and the path is fixed. Set the variable anyway.
 */
async function siteOrigin(): Promise<string> {
  const store = await headers();

  // The admin site signs in on its own hostname, and it has to come back to
  // that hostname or the whole exercise fails at the last step: session cookies
  // are scoped per host, so a callback landing on the public site would set
  // cookies there and leave the admin host signed out — forever, in a loop that
  // looks like sign-in silently doing nothing.
  //
  // This branch takes the host from the request, which `siteOrigin` otherwise
  // avoids on purpose. It is safe *because* it is not the request's choice:
  // the value is only used after it has matched the one hostname configured in
  // `MALFLEKS_ADMIN_HOST`, so a forged `Host` header can select this constant or
  // nothing at all. It cannot introduce an origin of its own.
  const requestHost = store.get("x-forwarded-host") ?? store.get("host") ?? null;
  const forwardedProto = store.get("x-forwarded-proto");
  const { resolveOAuthOrigin } = await import("@/lib/site-url");

  // The full decision -- admin-host precedence, and the guard against
  // NEXT_PUBLIC_SITE_URL having been misconfigured to equal the admin host --
  // lives in resolveOAuthOrigin so it can be unit tested without mocking
  // next/headers. See its doc comment in src/lib/site-url.ts for why the
  // guard exists.
  return resolveOAuthOrigin({
    requestHost,
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    configuredAdminHost: process.env.MALFLEKS_ADMIN_HOST,
    forwardedProto,
  });
}

export type SignInResult = { ok: false; message: string };

/**
 * Starts Google sign-in.
 *
 * On success this never returns — it redirects. The return type covers only the
 * failure paths, which is why it has no `ok: true`.
 *
 * Google is the one provider, for the reason `docs/auth.md` gives at length:
 * phone auth bills per SMS and turns a public sign-in button into a metered
 * spend an attacker controls, while roughly nine in ten mobile sessions in
 * Tanzania are on Android, where a Google account is part of setting the phone
 * up. Adding a second provider later is another call to this same function with
 * a different `provider` — not a rewrite.
 */
export async function startGoogleSignIn(next: string): Promise<SignInResult> {
  // The messages are read by the person who pressed the button, in the
  // language they chose.
  const copy = ACCOUNT[await chosenLocale()].signIn;

  if (!isAuthConfigured()) {
    return { ok: false, message: copy.actionUnconfigured };
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, message: copy.actionUnavailable };
  }

  const destination = safeDestination(next);
  const origin = await siteOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      queryParams: {
        // Always show the account chooser. On a shared phone — a normal device
        // pattern in this market — silently reusing the last Google account is
        // how one person's order request lands in another person's account.
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    return { ok: false, message: copy.actionGoogle };
  }

  // Outside any try/catch, as `redirect` works by throwing.
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  // `scope: "local"` clears this browser's cookies only. A global sign-out
  // would end the person's sessions on their other devices too, which is not
  // what pressing "sign out" on one phone means.
  await supabase?.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
}
