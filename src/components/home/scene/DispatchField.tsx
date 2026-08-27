"use client";

import { useEffect, useRef } from "react";

/**
 * Dispatch Fields — the generative layer behind the overture.
 *
 * The philosophy this implements is `docs/design/dispatch-fields.md`. In
 * short: an invisible force is only knowable through the paths of what it
 * moves, and every particle here is an order crossing a city — long clean
 * runs where a brand carries its own goods, curving hand-offs where a courier
 * takes over. Nobody has to read that to enjoy the field.
 *
 * ## Why this is hand-rolled rather than p5.js
 *
 * p5 is ~1MB before any of our own code, and `docs/research/engineering-
 * standards.md` names technical restraint as one of three things separating a
 * premium build from an expensive-looking one: heavy effects only where they
 * matter, so the rest stays fast enough for those moments to land. A hero
 * background that costs a Tanzanian marketplace its scroll performance has
 * inverted its own purpose. So: no dependency, no `Math.random()`, ~4KB.
 *
 * ## Why it draws once
 *
 * There is no animation loop. The field is composed across a few frames — so
 * it never blocks the main thread on a mid-range phone — and then it stops
 * forever. Nothing recomputes on scroll, and the canvas is a static bitmap
 * from that point on.
 *
 * ## Determinism
 *
 * `seed` addresses the field. The same seed produces the same image on every
 * machine, which is what makes it art-directable rather than a lottery: a
 * field can be chosen, reviewed and committed the way a photographer picks one
 * frame from a contact sheet.
 */

/** Deterministic PRNG. Small, fast, and good enough for spatial distribution. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep — the interpolant that keeps value noise from looking faceted. */
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Value noise over a hashed lattice. Hand-rolled rather than imported: a
 * gradient-noise library is a dependency for one function, and value noise is
 * indistinguishable here once two octaves are layered.
 */
function makeNoise(rand: () => number) {
  const SIZE = 256;
  const lattice = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < lattice.length; i += 1) lattice[i] = rand();

  const at = (x: number, y: number) =>
    lattice[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)];

  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);

    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);

    return (
      a * (1 - xf) * (1 - yf) +
      b * xf * (1 - yf) +
      c * (1 - xf) * yf +
      d * xf * yf
    );
  };
}

// --- Tuned constants. Each is load-bearing; see the philosophy document. -----

/** Incommensurate on purpose — a rational ratio makes the lattice visible. */
const OCTAVE_A = 0.0016;
const OCTAVE_B = 0.0053;
/** How much the second octave perturbs the first. Above ~0.4 it turns to mush. */
const OCTAVE_B_WEIGHT = 0.34;
/** Pixels per step. Smaller oversamples for no visible gain; larger shows corners. */
const STEP = 5.5;
const MAX_STEPS = 190;
/** Low enough that ~50 overlapping strokes are needed before the ground moves. */
const STROKE_ALPHA = 0.05;
const PARTICLES_PER_MEGAPIXEL = 420;
/** Chunked so a slow device never sees a long task. */
const STROKES_PER_FRAME = 90;

/**
 * Density weighting: quiet in the upper left where the headline needs air,
 * gathering toward the lower right where the eye leaves the scene. Returns a
 * 0–1 acceptance probability for a candidate spawn point.
 */
function spawnWeight(nx: number, ny: number): number {
  const towardExit = (nx + ny) / 2; // 0 top-left → 1 bottom-right
  return 0.12 + 0.88 * towardExit * towardExit;
}

export default function DispatchField({
  seed = 20260827,
  className,
}: {
  seed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    let frame = 0;
    let cancelled = false;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Cap DPR at 2: a 3x buffer on a phone triples the fill cost for a
      // difference nobody can see through 5% alpha strokes.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width === 0 || height === 0) return;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";

      const rand = mulberry32(seed);
      const noise = makeNoise(rand);

      const megapixels = (width * height) / 1_000_000;
      const target = Math.round(
        PARTICLES_PER_MEGAPIXEL * Math.max(0.35, megapixels),
      );

      // Rejection-sample spawn points against the density weighting, so the
      // composition is authored rather than uniform.
      const seeds: Array<[number, number]> = [];
      let guard = 0;
      while (seeds.length < target && guard < target * 24) {
        guard += 1;
        const x = rand() * width;
        const y = rand() * height;
        if (rand() <= spawnWeight(x / width, y / height)) seeds.push([x, y]);
      }

      let index = 0;

      const drawChunk = () => {
        if (cancelled) return;
        const end = Math.min(index + STROKES_PER_FRAME, seeds.length);

        for (; index < end; index += 1) {
          let [x, y] = seeds[index];
          let prevAngle: number | null = null;

          ctx.beginPath();
          ctx.moveTo(x, y);

          for (let step = 0; step < MAX_STEPS; step += 1) {
            const base = noise(x * OCTAVE_A, y * OCTAVE_A);
            const detail = noise(x * OCTAVE_B, y * OCTAVE_B);
            const angle =
              (base + (detail - 0.5) * OCTAVE_B_WEIGHT) * Math.PI * 4;

            x += Math.cos(angle) * STEP;
            y += Math.sin(angle) * STEP;
            if (x < -40 || x > width + 40 || y < -40 || y > height + 40) break;

            ctx.lineTo(x, y);

            // Colour carried by turn rate: a particle running with the field
            // burns toward chartreuse, one fighting a cross-current cools to
            // mint. Sampled once per stroke, at the point the path commits.
            if (prevAngle === null) {
              const turn = Math.abs(detail - base);
              const warm = Math.min(1, turn * 2.6);
              const r = Math.round(212 + (230 - 212) * warm);
              const g = Math.round(245 + (255 - 245) * warm);
              const b = Math.round(224 + (85 - 224) * warm);
              ctx.strokeStyle = `rgba(${r},${g},${b},${STROKE_ALPHA})`;
              ctx.lineWidth = 0.7 + rand() * 0.9;
              prevAngle = angle;
            }
          }

          ctx.stroke();
        }

        if (index < seeds.length) {
          frame = window.requestAnimationFrame(drawChunk);
        }
      };

      drawChunk();
    };

    // A resize changes the field, so it is redrawn — but debounced, because a
    // drag-resize would otherwise recompose on every pixel.
    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        window.cancelAnimationFrame(frame);
        cancelled = false;
        draw();
      }, 180);
    });

    draw();
    observer.observe(parent);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [seed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // `.scene-field` carries the opacity, including its reduced-motion
      // variant. It is NOT set from JS: this element renders on the server
      // too, and a JS-decided opacity is a hydration mismatch. See globals.css.
      className={["scene-field", className].filter(Boolean).join(" ")}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
