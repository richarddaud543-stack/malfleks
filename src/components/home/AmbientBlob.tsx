"use client";

import type { CSSProperties } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Ambient colour-wash blob — thin wrapper around globals.css's `.blob`
 * utility (unchanged: still a `position: absolute` div with `blob-drift`,
 * coloured entirely by the `bg-*` class the call site passes in).
 *
 * `.blob`'s `blob-drift` keyframes have no `prefers-reduced-motion` guard in
 * globals.css, and globals.css belongs to another engineer's round this
 * pass — so every call site needs its own gate. Doing it once here, instead
 * of repeating `useReducedMotion()` at each of the four blob call sites
 * across the homepage, is what keeps "no motion, none" actually true.
 * `animation: none` is set inline so it wins over the class regardless of
 * source order.
 */
export default function AmbientBlob({
  className,
  style,
}: {
  className: string;
  style?: CSSProperties;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={`blob ${className}`}
      style={reduceMotion ? { ...style, animation: "none" } : style}
    />
  );
}
