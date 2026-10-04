import { MALFLEKS_CONTACT_EMAIL } from "@/lib/contact";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * `/.well-known/security.txt` (RFC 9116): where someone who finds a security
 * problem on MalFleks should write.
 *
 * A site that holds customers' money should not make the person who has found
 * a hole in it guess whom to tell. The address is the one on the contact
 * page; there is no separate security inbox to pretend to have.
 *
 * `Expires` is required by the standard. It is set one year from the build
 * that produced this file, and every deploy rebuilds it -- so it only ever
 * lapses on a site nobody has deployed for a year, which is the situation the
 * field exists to flag.
 */
export const dynamic = "force-static";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function GET(): Response {
  const site = resolveSiteUrl();
  const expires = new Date(Date.now() + ONE_YEAR_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = [
    `Contact: mailto:${MALFLEKS_CONTACT_EMAIL}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en, sw",
    `Canonical: ${site}/.well-known/security.txt`,
    `Policy: ${site}/contact`,
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
