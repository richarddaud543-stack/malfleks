import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lets the admin deployment refresh *this* deployment's cache after a write
 * that changes the public catalogue — publishing a product, putting a
 * partner on the map. See `src/server/revalidate-public-site.ts` for why this
 * exists: `revalidatePath` cannot cross the boundary between the `malfleks`
 * and `malfleks-admin` Vercel projects on its own, so this endpoint is the
 * bridge, running in the process that actually owns the cache customers see.
 *
 * Bearer-token protected, same shape as the watchman endpoint described in
 * `claude/malfleks-local-agents.md`: refuses everything when the secret is
 * unset rather than defaulting open, because this endpoint runs work rather
 * than only reading — the opposite failure direction from
 * `MALFLEKS_ADMIN_HOST`, which fails open by design. All three ways to fail
 * (no secret configured, no header, wrong secret) return the same 401 so a
 * prober cannot tell them apart.
 */
export async function POST(request: Request) {
  const secret = process.env.MALFLEKS_REVALIDATE_SECRET?.trim();
  const header = request.headers.get("authorization")?.trim();
  const provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!secret || !provided || !timingSafeEqualStrings(secret, provided)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // The same set `revalidateCatalogue()` covers in the admin actions, kept in
  // sync by hand for now — both live in a small, deliberately-named group.
  revalidatePath("/");
  revalidatePath("/brands", "layout");
  revalidatePath("/products", "layout");
  revalidatePath("/delivery", "layout");
  revalidatePath("/search");
  revalidatePath("/locator");
  revalidatePath("/agents");
  revalidatePath("/partner");

  return NextResponse.json({ ok: true });
}

/** Same length check first, then a real constant-time compare — a length
 * mismatch is not itself secret, and `timingSafeEqual` throws rather than
 * returning `false` when its two buffers differ in length. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
