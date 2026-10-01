"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The rendered width of an element, kept current as it resizes.
 *
 * Charts draw at their real pixel width rather than scaling a fixed viewBox,
 * because a scaled SVG scales its text too: axis labels that are 11px on a
 * wide screen become 7px on a phone. Measuring keeps type at its real size.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setWidth(Math.max(160, Math.floor(element.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
