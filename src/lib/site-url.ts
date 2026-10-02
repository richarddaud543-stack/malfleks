import { adminHost, isAdminHost, normalizeHost } from "./admin-host";

/**
 * The site's own origin, for metadata, `robots.txt` and the sitemap.
 *
 * ## Why this is a function and not `process.env.X ?? fallback`
 *
 * It used to be exactly that, written out three times:
 *
 * ```ts
 * const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
 * ```
 *
 * `??` catches `undefined` and `null`. It does **not** catch `""`. So a
 * variable that exists but was never filled in sails straight through the
 * fallback and reaches `new URL("")`, which throws `ERR_INVALID_URL` — during
 * `next build`, while collecting page data, with the failure attributed to
 * `/_not-found` rather than to a configuration value. Measured on Vercel,
 * 2026-08-29, first deployment:
 *
 * ```
 * TypeError: Invalid URL
 *     at module evaluation (src/app/layout.tsx:34:17)
 *   code: 'ERR_INVALID_URL',
 *   input: ''
 * ```
 *
 * The empty string is not an exotic case; it is the *likely* one. A Vercel
 * environment variable someone created before they knew the domain, and a
 * `.env` line copied from `.env.example` — which ships `NEXT_PUBLIC_SITE_URL=""`
 * — both arrive as `""`. `supabaseAuthConfig` has treated blank as absent from
 * the day it was written, and its tests say why in as many words: *"a Vercel
 * field someone created but never filled"*. That prediction came true here, on
 * a different variable, because the reasoning had not been applied to it.
 *
 * So: one helper, `.trim()` then a truthiness check, matching `siteOrigin()` in
 * `app/actions/auth.ts`. Blank, whitespace-only and absent all mean the same
 * thing, because to the person deploying the site they *are* the same thing.
 *
 * The trailing slash is stripped so callers can append `/sitemap.xml` without
 * producing `//sitemap.xml`.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return "http://localhost:3000";
  return configured.replace(/\/+$/, "");
}

/**
 * The origin the admin console answers on, for links in MalFleks's own emails.
 *
 * `/admin` is only served on `MALFLEKS_ADMIN_HOST` (see `admin-host.ts`), so a
 * link built from `resolveSiteUrl()` 404s the moment a separate admin host is
 * configured -- which is exactly the production setup. With no admin host set
 * the console answers on every host, so the site's own origin is the right
 * fallback rather than no link at all.
 */
export function resolveAdminUrl(env: Record<string, string | undefined> = process.env): string {
  const host = adminHost(env.MALFLEKS_ADMIN_HOST);
  if (!host) return resolveSiteUrl(env);
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * The origin a Google OAuth redirect should come back to.
 *
 * ## The bug this exists to prevent
 *
 * The admin console and the public shop are the same codebase deployed as two
 * Vercel projects, and both have at times carried an identical set of
 * environment variable *names* -- see `claude/malfleks-audit.md`. That is
 * fine for a value like `BREVO_API_KEY`, which really is the same on both. It
 * is not fine for `NEXT_PUBLIC_SITE_URL`, which by definition must differ
 * per project. If the shop project's copy of it is ever set to the admin
 * project's hostname -- pasted across by hand, or carried over by a script
 * that does not know the two must differ -- a customer signing in on the
 * shop is sent, on return from Google, to the admin hostname instead.
 *
 * That host sits behind Vercel Authentication (see
 * `claude/soko-admin-site.md`), which is not part of this codebase at all --
 * it intercepts the request before any of our code runs. The customer lands
 * on a Vercel login screen, cannot get past it (they have no Vercel
 * account), and the shop is left showing them as signed out forever, because
 * the callback that would have created their session never ran. Confirmed
 * live on 2026-09-05: this is not a hypothetical.
 *
 * ## Why the guard lives here and not just in configuration
 *
 * Fixing the Vercel dashboard value fixes today's occurrence. It does not
 * stop the next redeploy, script, or well-meaning copy-paste from
 * reintroducing it, because nothing before this function noticed the two
 * variables had collided. This function is the one place that knows both
 * values at once, so it is the one place that can refuse to act on a
 * `NEXT_PUBLIC_SITE_URL` that has quietly become a duplicate of
 * `MALFLEKS_ADMIN_HOST`.
 *
 * The check only applies once we already know (from the caller having asked
 * `isAdminHost` first) that this particular request did *not* arrive on the
 * admin host. A request that genuinely is on the admin host is handled
 * before this function is reached at all -- see `siteOrigin()` in
 * `app/actions/auth.ts`.
 */
export function resolveOAuthOrigin(input: {
  requestHost: string | null | undefined;
  configuredSiteUrl: string | null | undefined;
  configuredAdminHost: string | null | undefined;
  forwardedProto?: string | null;
}): string {
  const { requestHost, configuredSiteUrl, configuredAdminHost, forwardedProto } = input;

  if (isAdminHost(requestHost, configuredAdminHost)) {
    const host = adminHost(configuredAdminHost)!;
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }

  const configured = configuredSiteUrl?.trim();
  if (configured) {
    const trimmed = configured.replace(/\/+$/, "");
    const expectedAdminHost = adminHost(configuredAdminHost);
    const collidesWithAdminHost =
      expectedAdminHost !== null && normalizeHost(trimmed) === expectedAdminHost;

    if (!collidesWithAdminHost) return trimmed;
    // Fall through: NEXT_PUBLIC_SITE_URL is misconfigured for this
    // deployment (it points at the admin host), so it is safer to derive the
    // origin from the request itself than to trust it.
  }

  const host = requestHost ?? "localhost:3000";
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
