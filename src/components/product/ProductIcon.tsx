import { type ProductIconKey } from "@/lib/product-icons";

export type { ProductIconKey };

interface ProductIconProps {
  icon: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Colour for the icon's single accent detail — the phone's camera module,
   * the power bank's bolt, a car's glass. Left unset it inherits the contour
   * colour at 45%, so an icon is still *one* colour wherever it is tinted by
   * the brand (`iconAccent(brand.accentColor)` in ProductCard, ListingCard,
   * ShowcaseCarousel) and never fights that tint with a second hue.
   */
  accentColor?: string;
  /** Stroke weight on the 44-unit grid. 2 is the system default. */
  strokeWidth?: number;
}

/**
 * Continuous-line contours on a shared 44x44 grid: stroke 2, round caps and
 * joins, no fill. Everything is a <path> — no <circle>/<rect> — so a circle is
 * two arcs and a lens/LED is a zero-length round-capped segment (`M19 12.5h0`).
 * One primitive means one place to change stroke behaviour later.
 *
 * The four vehicles deliberately share a chassis (ground line y=30.5, wheels at
 * x=12/32 r=4.2) so they align when a category row shows them side by side;
 * what tells them apart is roof height and the shape of the glass.
 */
const icons: Record<
  ProductIconKey,
  { contour: React.ReactNode; accent?: React.ReactNode }
> = {
  smartphone: {
    contour: (
      <path d="M16 4h12a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" />
    ),
    accent: (
      <>
        <path d="M17 8.5h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
        <path d="M19 12.5h0" />
        <path d="M19 35.5h6" />
      </>
    ),
  },
  tablet: {
    contour: (
      <path d="M11 4h22a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
    ),
    accent: (
      <>
        <path d="M22 7.5h0" />
        <path d="M18 36h8" />
      </>
    ),
  },
  laptop: {
    contour: (
      <>
        <path d="M11 9h22a2 2 0 0 1 2 2v18H9V11a2 2 0 0 1 2-2Z" />
        <path d="M9 29 4.8 36.6h34.4L35 29" />
      </>
    ),
    accent: (
      <path d="M19 32.8h6" />
    ),
  },
  smartwatch: {
    contour: (
      <>
        <path d="M18 12.5h8a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5v-9a5 5 0 0 1 5-5Z" />
        <path d="M18 12.5V6h8v6.5M18 31.5V38h8v-6.5" />
        <path d="M31 19.5v3.5" />
      </>
    ),
    accent: (
      <path d="M22 17v5.2l3.4 2" />
    ),
  },
  earbuds: {
    contour: (
      <>
        <path d="M16.5 9a5 5 0 0 1 2.5 9.3V29a2.5 2.5 0 0 1-5 0V18.3A5 5 0 0 1 16.5 9Z" />
        <path d="M27.5 9a5 5 0 0 0-2.5 9.3V29a2.5 2.5 0 0 0 5 0V18.3A5 5 0 0 0 27.5 9Z" />
      </>
    ),
    accent: (
      <>
        <path d="M16.5 13.5h0" />
        <path d="M27.5 13.5h0" />
      </>
    ),
  },
  headphones: {
    contour: (
      <>
        <path d="M9 27.5v-5a13 13 0 0 1 26 0v5" />
        <path d="M9 24h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z" />
        <path d="M35 24h-1a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3Z" />
      </>
    ),
    accent: (
      <>
        <path d="M9.5 28v4" />
        <path d="M34.5 28v4" />
      </>
    ),
  },
  speaker: {
    contour: (
      <>
        <path d="M14 4h16a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
        <path d="M22 20a7 7 0 1 0 0 14a7 7 0 1 0 0 -14Z" />
        <path d="M22 10.0a2.5 2.5 0 1 0 0 5.0a2.5 2.5 0 1 0 0 -5.0Z" />
      </>
    ),
    accent: (
      <path d="M22 24.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0 -5.6Z" />
    ),
  },
  powerbank: {
    contour: (
      <path d="M15 5h14a3 3 0 0 1 3 3v28a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" />
    ),
    accent: (
      <>
        <path d="M24.5 13.5 19.5 22.5h6l-5 8" />
        <path d="M18 34.5h0" />
        <path d="M22 34.5h0" />
        <path d="M26 34.5h0" />
      </>
    ),
  },
  charger: {
    contour: (
      <>
        <path d="M16 14h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3Z" />
        <path d="M18 14V8M26 14V8" />
      </>
    ),
    accent: (
      <path d="M19 26h6a1.8 1.8 0 0 1 0 3.6h-6a1.8 1.8 0 0 1 0-3.6Z" />
    ),
  },
  cable: {
    contour: (
      <>
        <path d="M12 5h4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M14 14v4a6 6 0 0 0 6 6h4a6 6 0 0 1 6 6v2" />
        <path d="M30 32h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
      </>
    ),
    accent: (
      <>
        <path d="M12.5 8.5h3" />
        <path d="M28.5 35.5h3" />
      </>
    ),
  },
  router: {
    contour: (
      <>
        <path d="M8 26h28a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z" />
        <path d="M13.5 19a12 12 0 0 1 17 0" />
        <path d="M17.5 23a6.4 6.4 0 0 1 9 0" />
      </>
    ),
    accent: (
      <>
        <path d="M11 32h0" />
        <path d="M15 32h0" />
        <path d="M19 32h0" />
      </>
    ),
  },
  simcard: {
    contour: (
      <>
        <path d="M16 5h9l6 6v25a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" />
        <path d="M18.5 15h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      </>
    ),
    accent: (
      <>
        <path d="M22 15v11" />
        <path d="M16.5 20.5h11" />
      </>
    ),
  },
  sedan: {
    contour: (
      <>
        <path d="M4 30.5v-4.2a2.5 2.5 0 0 1 1.9-2.4l5.4-1.3 4.4-5.6A5 5 0 0 1 19.6 15h6.2a5 5 0 0 1 3.5 1.4l5.8 5.7 4.5 1.1A2.5 2.5 0 0 1 40 25.6v4.9" />
        <path d="M4 30.5h3.8M16.2 30.5h11.6M36.2 30.5h3.8" />
        <path d="M12 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
        <path d="M32 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
      </>
    ),
    accent: (
      <path d="M14.6 21.6 17.6 17.8a2.5 2.5 0 0 1 2-1h5.6a2 2 0 0 1 1.4.6l4.2 4.2Z" />
    ),
  },
  suv: {
    contour: (
      <>
        <path d="M4 30.5v-5.2a2.5 2.5 0 0 1 2-2.5l3.2-.5 3.5-6.1A5 5 0 0 1 17 13.2h10a5 5 0 0 1 4.3 2.4l3.5 6.1 3.2.5a2.5 2.5 0 0 1 2 2.5v5.8" />
        <path d="M4 30.5h3.8M16.2 30.5h11.6M36.2 30.5h3.8" />
        <path d="M12 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
        <path d="M32 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
      </>
    ),
    accent: (
      <>
        <path d="M12.6 21.6 15.4 16.6a2.5 2.5 0 0 1 2.2-1.3h8.8a2.5 2.5 0 0 1 2.2 1.3l2.8 5Z" />
        <path d="M22 15.3v6.3" />
      </>
    ),
  },
  pickup: {
    contour: (
      <>
        <path d="M4 30.5v-5.2a2.5 2.5 0 0 1 2-2.5l3.2-.5 3.5-5.9A5 5 0 0 1 16.9 13.9h6.6a1.5 1.5 0 0 1 1.5 1.5v6.1h13.5a1.5 1.5 0 0 1 1.5 1.5v7.5" />
        <path d="M4 30.5h3.8M16.2 30.5h11.6M36.2 30.5h3.8" />
        <path d="M12 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
        <path d="M32 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
      </>
    ),
    accent: (
      <path d="M12.4 21.5 15.2 16.6a2.5 2.5 0 0 1 2.2-1.3h4.4a1 1 0 0 1 1 1v5.2Z" />
    ),
  },
  van: {
    contour: (
      <>
        <path d="M4 30.5V15.5a2 2 0 0 1 2-2h20a2 2 0 0 1 1.6.8l4.6 6.1a2 2 0 0 0 1.6.8h4.2a2 2 0 0 1 2 2v7.3" />
        <path d="M4 30.5h3.8M16.2 30.5h11.6M36.2 30.5h3.8" />
        <path d="M12 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
        <path d="M32 26.3a4.2 4.2 0 1 0 0 8.4a4.2 4.2 0 1 0 0 -8.4Z" />
      </>
    ),
    accent: (
      <>
        <path d="M9 16.9h8a1 1 0 0 1 1 1v3.7H8v-3.7a1 1 0 0 1 1-1Z" />
        <path d="M26.2 21.6v-5.8l4.4 5.8Z" />
      </>
    ),
  },
  motorcycle: {
    contour: (
      <>
        <path d="M10 32a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0 -11Z" />
        <path d="M34 32a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0 -11Z" />
        <path d="M10 32 16 22h8l3-8h4l4 8-1 10" />
        <path d="M19 24h6a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5Z" />
      </>
    ),
    accent: <path d="M34.5 20h0" />,
  },
  bicycle: {
    contour: (
      <>
        <path d="M9 30a6 6 0 1 0 0 12a6 6 0 1 0 0 -12Z" />
        <path d="M33 30a6 6 0 1 0 0 12a6 6 0 1 0 0 -12Z" />
        <path d="M9 30 17 15h6" />
        <path d="M17 15 23 30h10" />
        <path d="M23 30 27 15h4" />
      </>
    ),
    accent: <path d="M14 10h6" />,
  },
  tv: {
    contour: (
      <>
        <path d="M9 6h26a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" />
        <path d="M16 38h12M22 30v8" />
      </>
    ),
    accent: <path d="M9 32h0" />,
  },
  camera: {
    contour: (
      <>
        <path d="M6 15h6l2.5-3.5h11L28 15h10a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V17a2 2 0 0 1 2-2Z" />
        <path d="M22 21a6 6 0 1 0 0 12a6 6 0 1 0 0 -12Z" />
      </>
    ),
    accent: <path d="M33 18.5h0" />,
  },
  console: {
    contour: (
      <>
        <path d="M14 16h16a6 6 0 0 1 6 6a6 6 0 0 1-6 6h-2l-2-2h-8l-2 2h-2a6 6 0 0 1-6-6a6 6 0 0 1 6-6Z" />
        <path d="M16 22h4M18 20v4" />
      </>
    ),
    accent: (
      <>
        <path d="M28 20.3h0" />
        <path d="M31 23.3h0" />
      </>
    ),
  },
  printer: {
    contour: (
      <>
        <path d="M10 16h24a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-3v6H13v-6h-3a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z" />
        <path d="M14 16V6h16v10" />
        <path d="M14 31h16v6H14Z" />
      </>
    ),
    accent: <path d="M32 21h0" />,
  },
  generator: {
    contour: (
      <>
        <path d="M8 16h20a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3Z" />
        <path d="M14 16v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
        <path d="M10 32v3M26 32v3" />
        <path d="M31 19h5a2 2 0 0 1 2 2v3" />
      </>
    ),
    accent: <path d="M12 22a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0 -2.6Z" />,
  },
  fridge: {
    contour: (
      <>
        <path d="M11 4h22a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 17h26" />
      </>
    ),
    accent: (
      <>
        <path d="M28 8v5" />
        <path d="M28 21v5" />
      </>
    ),
  },
  ac: {
    contour: (
      <>
        <path d="M6 12h32a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z" />
        <path d="M11 24v3M33 24v3" />
      </>
    ),
    accent: <path d="M14 18h4M20 18h4M26 18h4" />,
  },
  fan: {
    contour: (
      <>
        <path d="M22 22a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0 -15Z" />
        <path d="M18.5 6a4 4 0 0 1 3.5 4v8.5a4 4 0 0 1-3.5-4Z" />
        <path d="M38 18.5a4 4 0 0 1-4 3.5h-8.5a4 4 0 0 1 4-3.5Z" />
        <path d="M22 39v3M17 42h10" />
      </>
    ),
    accent: <path d="M22 27.5a2 2 0 1 0 0 4a2 2 0 1 0 0 -4Z" />,
  },
  microwave: {
    contour: (
      <>
        <path d="M6 12h32a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2Z" />
        <path d="M10 16h16a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H10a1.5 1.5 0 0 1-1.5-1.5v-11a1.5 1.5 0 0 1 1.5-1.5Z" />
      </>
    ),
    accent: <path d="M33 20h0M33 24h0M33 28h0" />,
  },
  "gas-cylinder": {
    contour: (
      <>
        <path d="M14 14h16v20a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6V14Z" />
        <path d="M17 14v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" />
      </>
    ),
    accent: <path d="M20 6.5h4" />,
  },
};

export default function ProductIcon({
  icon,
  className,
  style,
  accentColor,
  strokeWidth = 2,
}: ProductIconProps) {
  const resolved: ProductIconKey = icon in icons ? (icon as ProductIconKey) : "smartphone";
  const { contour, accent } = icons[resolved];

  return (
    <svg
      viewBox="0 0 44 44"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {contour}
      {accent ? (
        <g stroke={accentColor} opacity={accentColor ? undefined : 0.45}>
          {accent}
        </g>
      ) : null}
    </svg>
  );
}
