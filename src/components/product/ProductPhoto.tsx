"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

import { canOptimizeProductPhoto } from "@/lib/product-photo";

/**
 * A product's real photo — the one component every surface draws it with.
 *
 * Before this existed each place that showed a photo had its own plain
 * `<img>`, each with its own crop: `object-cover` in a wide banner on the
 * card, a 112px circle on the product page. Three problems, one cause:
 *
 * - **Cropping hides the item.** A buyer deciding on a used phone needs the
 *   corners. Every frame here is a square with `object-contain`, so the whole
 *   photo is always visible and nothing is cut off to suit a layout.
 * - **Full-size files on mobile data.** A plain `<img>` sends the partner's
 *   1600px upload to a 96px search thumbnail. `next/image` asks for the size
 *   the slot needs, in AVIF or WebP, and lazy-loads it.
 * - **Layout shift.** The square frame reserves its space before the photo
 *   arrives.
 *
 * ## The frame is white, on purpose
 *
 * Not `bg-surface-2`: that token turns dark inside the homepage's night
 * scene, and a product photographed on a white sheet would sit in a dark
 * square with a white box inside it. The guidance partners are given is
 * "plain light background", so white is the surface their photos blend into.
 *
 * ## `fallback`
 *
 * What to draw when there is no photo, **or when the photo fails to load** —
 * every caller passes its icon tile. `product-icons.ts` has always promised
 * the icon "is what renders if an uploaded photo URL ever fails to load";
 * this is where that became true.
 *
 * ## `eager`
 *
 * For the one photo that is above the fold (the main image on a product
 * page). Next 16 deprecated `priority`; its docs say to reach for
 * `loading="eager"` and `fetchPriority="high"` in most cases rather than the
 * `preload` prop that replaced it, so that is what this sets.
 */
export default function ProductPhoto({
  src,
  alt,
  sizes,
  size,
  eager = false,
  original = false,
  className = "",
  fallback = null,
}: {
  /** The photo URL. Empty, null or undefined draws `fallback`. */
  src?: string | null;
  /** The product's name. Pass `""` only where the name is printed beside it. */
  alt: string;
  /**
   * How wide the frame is on screen, as a `sizes` attribute — required when
   * the frame is fluid, so the browser can pick the right file.
   */
  sizes?: string;
  /** A fixed square, in CSS pixels. Omit for a frame sized by its container. */
  size?: number;
  eager?: boolean;
  /**
   * Skip the optimiser and show the file as uploaded. For the zoom view,
   * where the point is to see every pixel the partner sent.
   */
  original?: boolean;
  /** Width, rounding and border for the frame. The square is not optional. */
  className?: string;
  fallback?: ReactNode;
}) {
  // Remembered per URL rather than as a bare boolean, so swapping to another
  // photo in the gallery is not still marked as failed.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const url = src?.trim() ?? "";
  if (url === "" || failedSrc === url) return <>{fallback}</>;

  // `next.config.ts` only allow-lists our own bucket, and only when the
  // Supabase URL was known at build time. Anything else is drawn as a plain
  // image rather than sent to an optimiser that would refuse it.
  const unoptimized =
    original ||
    !canOptimizeProductPhoto(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

  const loading = eager ? "eager" : "lazy";
  const onError = () => setFailedSrc(url);

  return (
    <div
      className={`relative aspect-square shrink-0 overflow-hidden bg-white ${className}`}
      style={size ? { width: size, height: size } : undefined}
      data-product-photo=""
    >
      {size ? (
        <Image
          src={url}
          alt={alt}
          width={size}
          height={size}
          sizes={sizes ?? `${size}px`}
          loading={loading}
          fetchPriority={eager ? "high" : undefined}
          unoptimized={unoptimized}
          onError={onError}
          className="h-full w-full object-contain"
        />
      ) : (
        <Image
          src={url}
          alt={alt}
          fill
          sizes={sizes ?? "100vw"}
          loading={loading}
          fetchPriority={eager ? "high" : undefined}
          unoptimized={unoptimized}
          onError={onError}
          className="object-contain"
        />
      )}
    </div>
  );
}
