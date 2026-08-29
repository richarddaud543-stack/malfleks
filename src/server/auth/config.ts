/**
 * How the app decides whether it has auth credentials — and nothing else.
 *
 * This module deliberately imports **no** Supabase code, for the same reason its
 * Firebase predecessor did not: the common case on this site is a signed-out
 * visitor whose session check needs none of it. Keeping the credential question
 * separate lets `verifySession()` answer "nobody is signed in" without
 * constructing a client at all.
 *
 * ## What changed in moving off Firebase
 *
 * Firebase needed a **service-account private key** on the server — a secret
 * granting full project access that bypassed both Security Rules and App Check,
 * and whose single most common failure was arriving with `\n` escaped instead of
 * real newlines. Supabase Auth needs no such thing. Both values below are public
 * identifiers that ship to every visitor by design, exactly like the old
 * `NEXT_PUBLIC_FIREBASE_*` config: the URL names the project, and the anon key
 * is a JWT asserting the `anon` role and nothing more.
 *
 * That is a real reduction in what can go wrong. There is no longer a private
 * key anywhere in this application's configuration.
 *
 * **The service_role key must never appear here or anywhere else in this repo.**
 * It bypasses Row Level Security completely. Soko does not need it: Prisma
 * reaches Postgres as the `postgres` role over `DATABASE_URL`, and Supabase is
 * used for identity only.
 */

/**
 * A bag of environment variables. Deliberately looser than `NodeJS.ProcessEnv`,
 * which requires `NODE_ENV` and so cannot be satisfied by a small object in a
 * test without pretending to be a whole environment.
 */
export type EnvSource = Record<string, string | undefined>;

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

/**
 * The two public values, or `null` if either is missing.
 *
 * Returning `null` rather than throwing is what preserves the property the
 * Firebase build had and this one keeps: **with auth unconfigured the site still
 * works.** The catalogue, search, the branch locator and the whole order flow
 * are open to signed-out visitors by design, so a missing key should cost you
 * `/account` and `/admin` — not the shop.
 */
export function supabaseAuthConfig(env: EnvSource = process.env): SupabaseAuthConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Whether sign-in is usable at all. Every auth entry point checks this first and
 * reports "sign-in is unavailable" rather than throwing a stack trace at a
 * customer who only wanted to buy a fridge.
 */
export function isAuthConfigured(env: EnvSource = process.env): boolean {
  return supabaseAuthConfig(env) !== null;
}
