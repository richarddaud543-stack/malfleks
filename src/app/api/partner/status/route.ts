import { isAuthConfigured } from "@/server/auth/config";
import { verifySession } from "@/server/auth/dal";

/**
 * Where the signed-in account stands with MalFleks, for `/apply`.
 *
 * An endpoint rather than a server-side read on the page for the reason
 * `apply/page.tsx` states at length: **that route must stay static.** A brand
 * that cannot find the page cannot apply, so it has to be indexable, which
 * rules out `await cookies()` anywhere in its render. The nav solves the same
 * problem the same way through `/api/auth/session`.
 *
 * The uid comes from the session and from nowhere else — there is no parameter
 * to supply — so this can only ever answer for the person asking. Nothing about
 * anyone else's application is reachable through it.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const unknown = Response.json(
    { state: "unknown" },
    { headers: { "Cache-Control": "no-store, private" } }
  );

  if (!isAuthConfigured()) return unknown;

  const session = await verifySession();
  if (!session) {
    return Response.json(
      { state: "signed-out" },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  }

  try {
    const { partnerStatusForUser } = await import("@/server/partners/status");
    const status = await partnerStatusForUser(session.uid);

    return Response.json(status, {
      // A cached "already a partner" served to the next visitor on a shared
      // connection would be a real defect, not a stale label. Same reasoning
      // as /api/auth/session.
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    // The database being unreachable must not stop someone applying. "unknown"
    // makes the form fall back to showing itself, which is the behaviour that
    // existed before this endpoint and is the safe direction to fail in.
    return unknown;
  }
}
