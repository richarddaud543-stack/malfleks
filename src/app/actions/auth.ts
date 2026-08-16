"use server";

import { revalidatePath } from "next/cache";
import { createSession, destroySession } from "@/server/auth/session";

/**
 * Sign-in and sign-out, as Server Actions.
 *
 * These are Server Actions rather than Route Handlers for one reason worth
 * stating: Next verifies the Origin against the Host on every Server Action
 * invocation and rejects the mismatch. A hand-rolled POST endpoint would need
 * that check written and, more to the point, remembered. The session cookie is
 * `SameSite=Lax`, so this closes the cross-site POST case twice over.
 *
 * The ID token travelling in the body is not a secret leak: it is short-lived,
 * bound to this Firebase project, and useless without the Admin SDK on the
 * other end. It is exchanged exactly once, for a cookie the browser's
 * JavaScript cannot read.
 */

export type SignInResult =
  | { ok: true }
  | { ok: false; message: string };

export async function signInWithIdToken(idToken: string): Promise<SignInResult> {
  if (typeof idToken !== "string" || idToken.length === 0) {
    return { ok: false, message: "Sign-in failed. Please try again." };
  }

  const result = await createSession(idToken);

  if (result.ok) {
    // The nav's auth state is fetched per navigation, but any Server Component
    // that read the session during this render pass is now stale.
    revalidatePath("/", "layout");
    return { ok: true };
  }

  // Each message says what the customer can do about it, and none of them
  // repeat back what the server knows about why the token was refused.
  switch (result.reason) {
    case "unconfigured":
      return {
        ok: false,
        message:
          "Signing in isn't available on this deployment yet. You can still place an order request without an account.",
      };
    case "stale":
      return {
        ok: false,
        message: "That sign-in took too long. Please try again.",
      };
    default:
      return {
        ok: false,
        message: "We couldn't verify that sign-in. Please try again.",
      };
  }
}

export async function signOut(): Promise<void> {
  await destroySession();
  revalidatePath("/", "layout");
}
