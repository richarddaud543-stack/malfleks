"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

import { dayLabel, formatAxisValue, formatValue, niceTicks, type DayPoint, type ValueFormat } from "@/lib/charts";
import ChartTooltip from "./ChartTooltip";
import { useMeasuredWidth } from "./useMeasuredWidth";

const M = { top: 10, right: 6, bottom: 24, left: 46 };

/**
 * One series of daily values as columns: thin (never over 24px), a 4px
 * rounded cap, square at the baseline, a 2px gap between neighbours.
 *
 * The plot is one focusable element; left/right arrows step through the days
 * and the readout is announced, so a keyboard user reads the same values a
 * mouse user hovers -- without 30 tab stops.
 */
export default function ColumnChart({
  points,
  valueFormat,
  seriesLabel,
  integer = false,
  height = 176,
}: {
  points: DayPoint[];
  valueFormat: ValueFormat;
  /** What one unit is, e.g. "orders" -- used in the readout. */
  seriesLabel: string;
  integer?: boolean;
  height?: number;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const format = (v: number) => formatValue(valueFormat, v);
  const axisFormat = (v: number) => formatAxisValue(valueFormat, v);
  const [active, setActive] = useState<number | null>(null);
  const liveId = useId();

  const plotW = Math.max(10, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max, 4, integer);
  const top = ticks[ticks.length - 1];
  const base = M.top + plotH;
  const y = (v: number) => base - (v / top) * plotH;
  const band = plotW / points.length;
  const barW = Math.max(2, Math.min(24, band - 2));
  const barX = (i: number) => M.left + band * i + (band - barW) / 2;
  const labelled = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - M.left) / band);
    setActive(i >= 0 && i < points.length ? i : null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? points.length - 1) + step)));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const current = active !== null ? points[active] : null;
  const readout = current ? `${dayLabel(current.day)}: ${format(current.value)} ${seriesLabel}` : "";

  return (
    <div ref={ref} className="relative">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${seriesLabel} per day. Use the left and right arrow keys to read each day.`}
        aria-describedby={liveId}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? points.length - 1)}
        onBlur={() => setActive(null)}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg width={width} height={height} onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-baseline)" : "var(--viz-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-axis)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            if (p.value <= 0) return null;
            const x = barX(i);
            const yTop = y(p.value);
            const r = Math.min(4, barW / 2, base - yTop);
            const d = `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${base} Z`;
            return <path key={p.day} d={d} fill="var(--viz-series)" opacity={active === null || active === i ? 1 : 0.55} />;
          })}
          {labelled.map((i) => (
            <text key={i} x={M.left + band * i + band / 2} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--viz-axis)">
              {dayLabel(points[i].day)}
            </text>
          ))}
        </svg>
      </div>
      <p id={liveId} aria-live="polite" className="sr-only">{readout}</p>
      {current && active !== null && (
        <ChartTooltip x={M.left + band * active + band / 2} y={y(current.value)} containerWidth={width} value={format(current.value)} label={dayLabel(current.day)} />
      )}
    </div>
  );
}
