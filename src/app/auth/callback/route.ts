import { NextResponse, type NextRequest } from "next/server";

import { safeDestination } from "@/lib/auth-redirect";
import { createServerSupabase } from "@/server/auth/supabase";

/**
 * Where Google returns the visitor after they approve.
 *
 * The URL carries a one-time `code`; `exchangeCodeForSession` trades it for an
 * access and refresh token and writes both as cookies. This is a Route Handler
 * rather than a Server Action or a page because it is the one place in the app
 * that *must* be able to set cookies — a Server Component cannot, which is the
 * whole reason `createServerSupabase` swallows that failure elsewhere.
 *
 * ## `next` is validated here, not just at the panel
 *
 * `SignInPanel` already ran `safeDestination` before handing the value to
 * Google. It runs again, and the repetition is the point: between those two
 * moments the parameter left our origin and came back, so at this line it is
 * attacker-controlled input. A crafted link — `/auth/callback?next=//evil.example`
 * — reaches this handler without ever touching the panel.
 *
 * ## Failures land on the sign-in page, not on a stack trace
 *
 * Every unhappy path — a denied consent screen, an expired or reused code, an
 * unconfigured deployment — sends the visitor back to `/sign-in` with a short
 * reason. None of them says why the server refused beyond what the person can
 * act on.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const next = safeDestination(url.searchParams.get("next"));

  // Google reports a declined consent screen this way rather than with a code.
  if (url.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/sign-in?error=cancelled", url.origin));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=failed", url.origin));
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(new URL("/sign-in?error=unconfigured", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
