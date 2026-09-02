import Image from "next/image";

/**
 * A brand's logo, or its initials when there isn't one.
 *
 * Every brand in the seeded catalogue shipped with an SVG in `/public`, so four
 * separate places rendered `<Image src={brand.logo} />` directly and none of
 * them considered the empty case. The moment brands started arriving from
 * partners rather than from `src/data`, that became a crash: a brand created by
 * an admin has no logo file — there is no storage bucket to upload one to — and
 * `next/image` throws on an empty `src` rather than degrading.
 *
 * So the fallback is a monogram: the brand's initials on its accent colour.
 * It looks deliberate, it is legible at 32px, and it means a new brand can go
 * live the day it is approved instead of waiting on an upload feature that does
 * not exist yet.
 *
 * `initials` takes at most two words, which is what fits: "Kariakoo
 * Electronics" is KE, "Halotel" is H.
 */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word));

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function BrandLogo({
  brand,
  sizes,
  className,
}: {
  brand: { name: string; logo: string; accentColor: string };
  /** Passed straight to `next/image`; ignored by the monogram. */
  sizes: string;
  /** Applied to the image only, so each call site keeps its own fit/padding. */
  className?: string;
}) {
  if (brand.logo.trim() !== "") {
    return (
      <Image
        src={brand.logo}
        alt={brand.name}
        fill
        sizes={sizes}
        className={className}
      />
    );
  }

  return (
    <span
      // `aria-hidden` plus a real label: screen readers get the brand name once,
      // from the heading beside it, rather than "K E" spelled out.
      className="absolute inset-0 flex items-center justify-center rounded-[inherit] font-display text-base font-semibold tracking-tight text-white"
      style={{ background: brand.accentColor }}
      aria-hidden="true"
    >
      {initials(brand.name)}
    </span>
  );
}
