import { verifySession } from "@/server/auth/dal";

/**
 * Who is signed in, for client components that need to know.
 *
 * Why this exists rather than reading the session in the root layout: every
 * catalogue page in this app is statically prerendered, and a top-level
 * `await cookies()` in `layout.tsx` would make every one of them dynamic. That
 * is a real cost — a whole prerendered site traded for a nav label — and Next's
 * own guide warns about the same thing for streaming.
 *
 * So the shell stays static and the two client components that care ask this
 * endpoint. It is authoritative: it goes through the same DAL as everything
 * else, so it reflects the *session cookie*, not the client SDK's own idea of
 * who is signed in. Those two can disagree — a cookie can expire while the
 * client SDK still holds a user — and when they do, the cookie is right.
 *
 * Nothing sensitive is returned. A display name and whether a session exists;
 * no uid, no email, no token.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await verifySession();

  return Response.json(
    session
      ? { signedIn: true, name: session.name, picture: session.picture }
      : { signedIn: false, name: null, picture: null },
    {
      headers: {
        // A cached "signed in" served to the next visitor on a shared
        // connection would be a real defect, not a stale label.
        "Cache-Control": "no-store, private",
      },
    }
  );
}
