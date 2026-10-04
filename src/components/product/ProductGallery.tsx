"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ProductPhoto from "./ProductPhoto";

/**
 * The photos on a product page: one large image, a strip of thumbnails when
 * there is more than one, and a full-screen view to look closely.
 *
 * This replaced a 112px circle that cropped the photo with `object-cover` —
 * about the size of a thumbnail, with the corners cut off, on the one page
 * where a buyer is deciding whether to pay. Everything here is about letting
 * them see the item:
 *
 * - The main image is a square with the whole photo inside it. Nothing is
 *   cropped.
 * - The strip is **thumbnails, not dots**. Dots say "there are four"; a
 *   thumbnail says "the fourth one shows the scratch on the back", which is
 *   the photo a careful buyer is looking for.
 * - Tapping the main image opens the file exactly as the partner uploaded it,
 *   full screen, where the phone's own pinch-zoom works. No custom zoom
 *   gesture: the native one is the one people already know, and it does not
 *   break on the next browser release.
 *
 * ## Closing the full-screen view
 *
 * Three ways, because people reach for all three: the close button, Escape,
 * and **the browser's Back button**. On a phone, Back is how people leave a
 * full-screen thing; without handling it, Back would leave the whole product
 * page and the buyer would be back at search wondering what happened. Opening
 * pushes one history entry and Back pops it. Closing by the button or Escape
 * goes back through that same entry, so history never fills with stale ones.
 *
 * The view is rendered into `document.body` through a portal. This component
 * sits inside a `ScrollReveal` (a CSS transform) and a sticky column on the
 * product page, and a transformed ancestor turns `position: fixed` into
 * "fixed to that ancestor" — the overlay would have covered the left column
 * rather than the screen.
 */
export default function ProductGallery({
  photos,
  name,
}: {
  /** Main photo first. The page only renders this when there is at least one. */
  photos: string[];
  /** The product's name, for the photos' alt text and the dialog's label. */
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Whether the open view owns a history entry that Back should pop.
  const pushedRef = useRef(false);

  const count = photos.length;
  // The list can shrink under a mounted gallery (an admin removes a photo and
  // the page revalidates), so the index is clamped on read, not trusted.
  const current = Math.min(index, Math.max(0, count - 1));
  const many = count > 1;

  const open = useCallback(() => {
    // Pushed here, in the tap handler, not in an effect: an effect would run
    // twice under Strict Mode and leave an entry behind that Back lands on.
    window.history.pushState(window.history.state, "", window.location.href);
    pushedRef.current = true;
    setZoomed(true);
  }, []);

  const close = useCallback(() => {
    if (pushedRef.current) {
      // Go back through the entry `open` pushed; the popstate listener below
      // is what actually closes the view.
      window.history.back();
      return;
    }
    setZoomed(false);
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (Math.min(i, count - 1) + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!zoomed) return;

    const onPopState = () => {
      pushedRef.current = false;
      setZoomed(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);

      // Keep Tab inside the view. Everything behind it is covered, and focus
      // wandering onto a link nobody can see is how a keyboard user gets lost.
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled])",
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside = dialogRef.current?.contains(active) ?? false;
        if (event.shiftKey && (active === first || !inside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !inside)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("popstate", onPopState);
    document.addEventListener("keydown", onKeyDown);

    // The page behind must not scroll under the view.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    closeRef.current?.focus();
    // Captured now: by the time the cleanup runs the ref may have moved on.
    const trigger = triggerRef.current;

    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKeyDown);
      root.style.overflow = previousOverflow;
      // Back where the person was, so the next Tab continues from the image.
      trigger?.focus();
    };
  }, [zoomed, close, step]);

  if (count === 0) return null;

  const src = photos[current];
  const position = many ? ` — photo ${current + 1} of ${count}` : "";

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-label={`Zoom in on ${name}${position}`}
        data-testid="gallery-main"
        className="glass-card shadow-float relative block w-full cursor-zoom-in overflow-hidden rounded-[1.75rem] p-0 sm:rounded-[2rem]"
      >
        <ProductPhoto
          src={src}
          alt={`${name}${position}`}
          // Half the page on desktop (the two-column grid), the full width
          // below it. The page container is `max-w-6xl`, so it never needs
          // more than ~560px of image on a wide screen.
          sizes="(min-width: 1024px) 560px, 100vw"
          eager
          className="w-full"
          fallback={
            <span className="flex aspect-square w-full items-center justify-center bg-white px-6 text-center text-sm text-muted">
              This photo couldn&apos;t be loaded.
            </span>
          }
        />
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-medium text-background">
          Tap to zoom
        </span>
      </button>

      {many && (
        <ul className="relative mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={`Photos of ${name}`}>
          {photos.map((photo, i) => {
            const selected = i === current;
            return (
              <li key={photo} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show photo ${i + 1} of ${count}`}
                  aria-current={selected ? "true" : undefined}
                  className={`block overflow-hidden rounded-xl border-2 transition-colors ${
                    selected ? "border-accent" : "border-border hover:border-foreground/40"
                  }`}
                >
                  {/* 64px: comfortably past the 44px touch minimum, and four
                      of them plus gaps still fit a 320px-wide phone. The alt
                      is empty because the button's label already says which
                      photo this is — reading the product name six times over
                      helps nobody. */}
                  <ProductPhoto
                    src={photo}
                    alt=""
                    size={64}
                    fallback={<span className="block h-16 w-16 bg-white" />}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {zoomed &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${name}${position}`}
            data-testid="gallery-lightbox"
            className="fixed inset-0 z-[100] flex flex-col bg-black"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
              <p className="min-w-0 truncate text-sm" aria-live="polite">
                {many ? `Photo ${current + 1} of ${count}` : name}
              </p>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="min-h-11 shrink-0 rounded-full border border-white/40 px-5 text-sm font-medium text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {/* `touch-action` leaves pinch and pan to the browser. The image
                is the file as uploaded (`original`), not a resized copy, so
                zooming in shows real detail rather than a blurry enlargement. */}
            <div
              className="relative min-h-0 flex-1 overflow-auto"
              style={{ touchAction: "pinch-zoom pan-x pan-y" }}
            >
              {/* A plain img, not `ProductPhoto`: the square white frame is
                  right for a tile and wrong here, where a tall photo should
                  use the whole height of the screen. `next/image` would add
                  nothing either — this is deliberately the unresized file. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${name}${position}`}
                className="h-full w-full object-contain"
              />
            </div>

            {many && (
              <div className="flex items-center justify-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous photo"
                  className="min-h-11 rounded-full border border-white/40 px-5 text-sm font-medium text-white hover:bg-white/10"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next photo"
                  className="min-h-11 rounded-full border border-white/40 px-5 text-sm font-medium text-white hover:bg-white/10"
                >
                  Next →
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
