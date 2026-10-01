"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

import { dayLabel, formatAxisValue, formatValue, niceTicks, type DayPoint, type ValueFormat } from "@/lib/charts";
import ChartTooltip from "./ChartTooltip";
import { useMeasuredWidth } from "./useMeasuredWidth";

const M = { top: 22, right: 10, bottom: 24, left: 58 };

/**
 * One series over time: a 2px line, a 10% wash beneath it, a crosshair that
 * snaps to the nearest day, and the latest value labelled at the end -- the
 * one number on the chart that earns a direct label.
 */
export default function AreaChart({
  points,
  valueFormat,
  seriesLabel,
  height = 176,
}: {
  points: DayPoint[];
  valueFormat: ValueFormat;
  seriesLabel: string;
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
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];
  const base = M.top + plotH;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => M.left + step * i;
  const y = (v: number) => base - (v / top) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${base} L${x(0)},${base} Z`;
  const last = points.length - 1;
  const labelled = [...new Set([0, Math.floor(last / 2), last])];

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - rect.left - M.left) / (step || 1));
    setActive(Math.min(last, Math.max(0, i)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.min(last, Math.max(0, (a ?? last) + delta)));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const current = active !== null ? points[active] : null;
  const readout = current ? `${dayLabel(current.day)}: ${format(current.value)}` : "";

  return (
    <div ref={ref} className="relative">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${seriesLabel} per day. Use the left and right arrow keys to read each day.`}
        aria-describedby={liveId}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? last)}
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
          <path d={area} fill="var(--viz-series-wash)" />
          <path d={line} fill="none" stroke="var(--viz-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={base} stroke="var(--viz-baseline)" strokeWidth={1} shapeRendering="crispEdges" />
          )}
          {/* End marker and its direct label: the latest value is the story. */}
          <circle cx={x(last)} cy={y(points[last].value)} r={4} fill="var(--viz-series)" stroke="var(--viz-surface)" strokeWidth={2} />
          {/* Only a non-zero endpoint is worth a label -- "TSh 0" on a line
              that has just dropped to the baseline is noise, and it sat on
              top of the line. The halo (stroke painted under the fill) keeps
              any label legible where it crosses a mark. */}
          {points[last].value > 0 && (
            <text x={x(last)} y={y(points[last].value) - 10} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--viz-ink)" stroke="var(--viz-surface)" strokeWidth={3} paintOrder="stroke" style={{ fontVariantNumeric: "tabular-nums" }}>
              {format(points[last].value)}
            </text>
          )}
          {active !== null && active !== last && (
            <circle cx={x(active)} cy={y(points[active].value)} r={4} fill="var(--viz-series)" stroke="var(--viz-surface)" strokeWidth={2} />
          )}

          {labelled.map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize={11} fill="var(--viz-axis)">
              {dayLabel(points[i].day)}
            </text>
          ))}
        </svg>
      </div>
      <p id={liveId} aria-live="polite" className="sr-only">{readout}</p>
      {current && active !== null && (
        <ChartTooltip x={x(active)} y={y(current.value)} containerWidth={width} value={format(current.value)} label={dayLabel(current.day)} swatch="var(--viz-series)" />
      )}
    </div>
  );
}
