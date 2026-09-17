"use client";

import { motion, useReducedMotion } from "motion/react";
import ProductIcon from "./ProductIcon";
import { iconAccent } from "@/lib/accent";

/**
 * The light direction's replacement for the deleted `ProductShowcaseScene`
 * (a `MeshDistortMaterial` pedestal with the product's SVG icon floated
 * above it via a `drei` `Html` portal). Same job — give the product a
 * presence beside its specs — done as a static, layered composition
 * instead of a lit, distorted sphere: a tinted panel, two flat depth rings,
 * an ambient colour wash in the back corners, and the real product icon
 * large in the middle.
 *
 * Renders as a single stable root (`props in, one <div> out` — `motion.div`
 * still renders one real `<div>`, an `initial`/`animate` entrance doesn't
 * change that) because this lives inside `<ViewTransition
 * name={`product-${id}`}>` in `src/app/products/[id]/page.tsx` — the shared
 * element the card morphs into. No conditional early return here that would
 * swap out the transitioning node itself.
 */
export default function ProductShowcase({
  accentColor,
  icon,
  photoUrl,
}: {
  accentColor: string;
  icon: string;
  /** A real uploaded photo. When present, replaces the icon puck below. */
  photoUrl?: string;
}) {
  const reduceMotion = useReducedMotion();
  const iconColor = iconAccent(accentColor);

  return (
    <motion.div
      // A one-shot "materialize" on mount — the showcase's own entrance,
      // independent of the idle float loop on the icon puck below. A spring
      // (rather than the duration-based tween the rest of this file uses)
      // because a settle-in is exactly the "reacts naturally" case motion.dev
      // frames spring physics for — a single arrival, not a toggled state.
      // Skipped outright under reduced motion: this stays the single stable
      // root the surrounding `<ViewTransition>` requires either way, just
      // rendered straight at its final state with no `initial` to animate
      // from.
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 260, damping: 24 }
      }
      className="glass-card shadow-float relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.75rem] sm:rounded-[2rem]"
      style={{
        background: `linear-gradient(135deg, ${accentColor}14, var(--surface-2) 65%)`,
      }}
    >
      {/* Ambient tint wash in the back corners — flat colour and blur
          standing in for the old scene's coloured point lights. Static; no
          `.blob` drift here, this panel is meant to hold still. */}
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 h-64 w-64 rounded-full blur-3xl"
        style={{ background: accentColor, opacity: 0.16 }}
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full blur-3xl"
        style={{ background: accentColor, opacity: 0.1 }}
      />

      {/* Concentric depth rings — the flat, restrained stand-in for the old
          scene's 3D ring geometry beneath the pedestal. */}
      <div
        aria-hidden="true"
        className="absolute flex items-center justify-center"
      >
        <div
          className="h-56 w-56 rounded-full border sm:h-64 sm:w-64"
          style={{ borderColor: `${accentColor}22` }}
        />
        <div
          className="absolute h-40 w-40 rounded-full border sm:h-48 sm:w-48"
          style={{ borderColor: `${accentColor}33` }}
        />
      </div>

      <motion.div
        className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full sm:h-36 sm:w-36"
        style={{
          background: `${accentColor}1f`,
          boxShadow: `0 24px 48px -20px ${accentColor}55`,
        }}
        animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }
        }
      >
        {photoUrl ? (
          // A real uploaded photo fills the puck instead of floating an icon
          // over it — eslint-disable, see ProductCard.tsx for why this is a
          // plain img rather than next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <ProductIcon
            icon={icon}
            className="h-16 w-16 sm:h-20 sm:w-20"
            style={{ color: iconColor }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
