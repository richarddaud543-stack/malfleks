"use client";

import { useId, useState } from "react";

import ChartTooltip from "./ChartTooltip";
import { useMeasuredWidth } from "./useMeasuredWidth";

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** A `var(--viz-*)` colour from the validated set, never an ad-hoc hex. */
  color: string;
}

/**
 * Part-to-whole as one horizontal bar: segments separated by a 2px gap, the
 * outer ends rounded. Segments must arrive in the validated order (see the
 * `.viz` note in globals.css) -- that order is what keeps the colour-blind
 * separation passing, so callers pass it, they do not sort it.
 *
 * The legend is always present and carries every count, zeros included, so
 * no value depends on colour or on hovering.
 */
export default function StackedBar({ segments }: { segments: Segment[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const clipId = useId().replace(/:/g, "");
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const height = 16;
  const visible = segments.filter((s) => s.value > 0);

  // Each segment starts where the ones before it end. Computed from the
  // values, not by mutating a running total inside a callback.
  const placed = visible.map((s, i) => {
    const x = (visible.slice(0, i).reduce((sum, v) => sum + v.value, 0) / total) * width;
    const full = (s.value / total) * width;
    const w = Math.max(1, full - (i < visible.length - 1 ? 2 : 0));
    return { ...s, x, w, mid: x + w / 2 };
  });
  const hovered = placed.find((p) => p.key === active);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} aria-hidden="true" onPointerLeave={() => setActive(null)}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={width} height={height} rx={4} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {placed.map((p) => (
            <rect
              key={p.key}
              x={p.x}
              y={0}
              width={p.w}
              height={height}
              fill={p.color}
              opacity={active === null || active === p.key ? 1 : 0.55}
              onPointerEnter={() => setActive(p.key)}
            />
          ))}
        </g>
      </svg>
      {hovered && (
        <ChartTooltip
          x={hovered.mid}
          y={0}
          containerWidth={width}
          value={`${hovered.value} · ${pct(hovered.value)}%`}
          label={hovered.label}
          swatch={hovered.color}
        />
      )}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted">{s.label}</span>
            <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
