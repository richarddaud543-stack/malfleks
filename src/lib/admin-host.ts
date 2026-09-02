/**
 * Which hostname the admin console is allowed to answer on.
 *
 * ## Why a hostname and not a secret path
 *
 * `/admin` was already unlinked from every page, `noindex`, absent from the
 * sitemap, and a 404 to anyone signed in who is not an admin. What it was not
 * is *absent*: type the URL on the public site and the route exists, which is
 * enough to tell a curious customer that Soko has a back office and roughly
 * where it lives.
 *
 * Moving it to its own hostname is a different kind of answer. The public site
 * genuinely does not serve `/admin` — the 404 there is the same 404 as a
 * misspelled brand slug, because as far as that host is concerned the route
 * really is not there. And unlike a secret path, a hostname does not leak
 * through browser history, a `Referer` header, or a screenshot of the address
 * bar: it is the site, not a password hidden inside a URL.
 *
 * ## Unconfigured means "no restriction", on purpose
 *
 * With `SOKO_ADMIN_HOST` unset — local development, CI, preview deployments,
 * and this app as it stands before the domain is added — the admin routes
 * answer on whatever host is asking, exactly as they did before this file
 * existed.
 *
 * Failing *open* here is deliberate, and the reasoning is worth writing down
 * because the instinct runs the other way. The cost of an accidentally empty
 * variable, if this failed closed, is that the owner is locked out of his own
 * console with no way back in except a redeploy — from a system he administers
 * but cannot reach. The cost of failing open is that `/admin` is reachable on
 * the public host again by an admin who types it, which is precisely where the
 * app was yesterday and was never the security boundary. Authorization is
 * `isAdminUser`, in the DAL, next to the data. This module only decides which
 * front door the console hangs behind.
 *
 * And blank counts as unset. `??` does not catch `""`, and an environment
 * variable someone created in the Vercel dashboard before they knew the
 * hostname arrives as `""` — this project has been caught by that trap on
 * `NEXT_PUBLIC_SITE_URL` already, at the cost of a failed production build.
 * Every reader here goes through `.trim()`.
 *
 * ## No `process.env` in here
 *
 * Every function takes the configured value as an argument instead of reading
 * the environment itself. That is not purity for its own sake: `proxy.ts` runs
 * in the Edge runtime, where Next inlines `process.env.SOME_NAME` by static
 * analysis at build time. A read through a parameter — `env.SOKO_ADMIN_HOST`,
 * where `env` is a variable — is not statically visible, so it would inline to
 * nothing and the proxy would silently believe no admin host is configured.
 * Callers do the literal read; this module does the thinking.
 */

/**
 * A hostname reduced to the one form two of them can be compared in.
 *
 * Accepts what people actually paste: a bare host, a host with a port, or a
 * whole URL copied out of the browser. Case is folded because DNS is
 * case-insensitive; the default port is dropped because `soko.example` and
 * `soko.example:443` are the same site; a trailing dot is dropped because
 * `soko.example.` is the fully-qualified spelling of the same name and a
 * browser will happily send it.
 *
 * A non-default port is *kept* — `localhost:3000` and `localhost:3001` are two
 * different dev servers and conflating them would be wrong.
 */
export function normalizeHost(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  let host = raw;
  if (host.includes("://")) {
    try {
      host = new URL(host).host;
    } catch {
      // Not a URL after all — fall through and treat it as a bare host.
    }
  }

  host = host.toLowerCase().replace(/\.+$/, "");
  host = host.replace(/:443$/, "").replace(/:80$/, "");

  return host.length > 0 ? host : null;
}

/**
 * The configured admin hostname, or `null` when there isn't one.
 *
 * Pass `process.env.SOKO_ADMIN_HOST` — read literally, at the call site. See
 * the note on the Edge runtime above.
 */
export function adminHost(configured: string | null | undefined): string | null {
  return normalizeHost(configured);
}

/**
 * Is this request arriving *on* the admin hostname?
 *
 * `false` when nothing is configured, which is what makes it safe to hang the
 * cosmetic behaviour off this one — the root redirect, the `noindex` header, a
 * `robots.txt` that says stay out. None of those should fire on a normal
 * deployment that has no separate admin host.
 */
export function isAdminHost(
  requestHost: string | null | undefined,
  configured: string | null | undefined
): boolean {
  const expected = adminHost(configured);
  if (!expected) return false;

  const actual = normalizeHost(requestHost);
  return actual !== null && actual === expected;
}

/**
 * May the admin routes answer at all on the host this request arrived on?
 *
 * The inverse of `isAdminHost` in the unconfigured case, and that difference is
 * the whole point: with no admin host set this is `true` everywhere, so nothing
 * changes for local development or for the deployment as it stands today.
 */
export function adminRoutesAllowedOn(
  requestHost: string | null | undefined,
  configured: string | null | undefined
): boolean {
  if (!adminHost(configured)) return true;
  return isAdminHost(requestHost, configured);
}
