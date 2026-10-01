"use client";

/**
 * The one tooltip every chart uses. Value first and strong, label second and
 * quiet -- the reader already knows which series they pointed at; what they
 * want is the number. Positioned inside the chart's own box and clamped to it
 * so it never spills off a narrow card.
 */
export default function ChartTooltip({
  x,
  y,
  containerWidth,
  value,
  label,
  swatch,
}: {
  x: number;
  y: number;
  containerWidth: number;
  value: string;
  label: string;
  /** A short line key in the series colour, for multi-series marks. */
  swatch?: string;
}) {
  const width = 150;
  const left = Math.min(Math.max(0, x - width / 2), Math.max(0, containerWidth - width));
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-white px-3 py-2 shadow-sm"
      style={{ left, top: Math.max(0, y - 58), width }}
    >
      <p className="text-sm font-semibold text-foreground tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
        {swatch && (
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: swatch }} />
        )}
        {label}
      </p>
    </div>
  );
}
