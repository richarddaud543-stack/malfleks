"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A browser-side Supabase client, for the one thing this app does client-side
 * with Supabase directly: uploading a product photo to Storage
 * (`ProductPhotoUpload`).
 *
 * Everything else — auth, every database read and write — goes through the
 * server (`createServerSupabase` for auth, Prisma for data), by design; see
 * the note in `.env.example` on why there is no service-role key anywhere in
 * this app. Storage is the one exception, and it is not a gap in that design:
 * Storage has its own row-level security, exactly like Postgres, and the
 * policies on the `product-photos` bucket are the boundary, not this client.
 * It carries only the two public values already shipped to every visitor in
 * the client bundle (see `NEXT_PUBLIC_SUPABASE_ANON_KEY`'s own note) and reads
 * the same session cookies `createServerSupabase` does, so an upload is
 * authorized as the signed-in partner, not as an anonymous visitor.
 *
 * Returns `null` under the same "auth is optional" rule `supabaseAuthConfig`
 * follows — a deployment with no Supabase keys configured simply cannot
 * upload a photo, and `ProductPhotoUpload` degrades to "photo upload isn't
 * available right now" rather than throwing.
 */
export function createBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
