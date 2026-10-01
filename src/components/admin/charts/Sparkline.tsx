/**
 * A stat tile's trend: the body in a quiet grey, the latest point in the
 * accent, no axes. Decorative by contract -- the tile beside it states the
 * number in text -- so it is hidden from assistive tech.
 */
export default function Sparkline({
  values,
  width = 88,
  height = 26,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pad = 3;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${pad + step * i},${y(v)}`).join(" ");
  const lastX = pad + step * (values.length - 1);
  return (
    <svg width={width} height={height} aria-hidden="true" className="viz shrink-0">
      <path d={d} fill="none" stroke="var(--viz-deemph)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={y(values[values.length - 1])} r={2.5} fill="var(--viz-series)" />
    </svg>
  );
}
