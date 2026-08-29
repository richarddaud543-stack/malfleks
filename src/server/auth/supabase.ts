import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabaseAuthConfig } from "./config";

/**
 * A request-scoped Supabase client that reads and writes Next's cookie jar.
 *
 * ## Why the cookie write can fail, and why that is not an error
 *
 * Supabase keeps the session in cookies and rotates them when the access token
 * is close to expiry, which means *reading* the session can want to *write* one.
 * Next forbids setting a cookie from a Server Component — by the time one runs,
 * the response headers may already be on the wire. So `setAll` is wrapped: in a
 * Route Handler or Server Action the write lands, and in a Server Component it
 * throws and is swallowed.
 *
 * Swallowing it is safe here specifically because the refresh is not load-
 * bearing. The old cookie is still valid at that moment — that is why the
 * request succeeded far enough to attempt a refresh — and the next Route Handler
 * or Action the visitor hits will persist a fresh one. What would make this
 * unsafe is a *silent* failure with no explanation, which is what this comment
 * exists to prevent.
 */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  const config = supabaseAuthConfig();
  if (!config) return null;

  const store = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server Component render. See the note above — the existing cookie
          // is still valid, and a later Action or Route Handler will rotate it.
        }
      },
    },
  });
}
