/**
 * Where to land after signing in.
 *
 * This used to live inside `SignInPanel` because the panel was the only thing
 * that handled the value. Under Supabase's OAuth flow it is not: `next` is
 * handed to Google, comes back through `/auth/callback` as a query parameter,
 * and is used there to build a redirect. **A value that leaves our origin and
 * returns is attacker-controlled**, so the callback has to validate it again
 * rather than trust that the panel already did. One rule, imported by both.
 */

export const DEFAULT_DESTINATION = "/account";

/**
 * Anything that is not a plain same-site path is discarded.
 *
 * `//evil.example` and `https://evil.example` are both valid *values* of a
 * query parameter and both are open redirects — the protocol-relative one
 * especially, because it looks like a path. Backslashes are rejected too: some
 * browsers normalise `/\` to `//`.
 */
export function safeDestination(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_DESTINATION;
  if (!raw.startsWith("/")) return DEFAULT_DESTINATION;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_DESTINATION;
  return raw;
}
