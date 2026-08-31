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
