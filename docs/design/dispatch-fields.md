# Dispatch Fields — an algorithmic philosophy

*Written 2026-08-27 for the MalFleks home page overture. The algorithm it
describes lives at `src/components/home/scene/DispatchField.tsx`.*

---

## The movement

**Dispatch Fields** is a generative aesthetic built on a single premise: an
invisible force is only knowable through the paths of the things it moves. It
does not draw the field. It draws what the field *did* — the accumulated
evidence of thousands of journeys through a space whose rules you never see
directly.

This is not decoration that happens to sit behind a headline. The conceptual
seed is MalFleks's own product: `resolveDeliveryRoute()`, four lines long, deciding
at every branch whether a brand's fleet carries an order or a local courier
does. Every particle in this field is an order finding its way across a city.
Some paths run long and clean — the branch that carries its own goods, end to
end. Others fracture and hand off, curving into a neighbouring current — the
courier picking up where the brand stops. Nobody looking at the hero needs to
know this. Someone who has read the routing rule will feel it anyway, and that
asymmetry is the point: the reference must deepen the work without announcing
itself.

## Computational expression

The field is layered value noise, sampled at two octaves with deliberately
incommensurate frequencies so the interference never resolves into a visible
grid — the tell of a lazy implementation. Each sample yields an angle; each
angle bends a particle; each particle leaves a polyline of diminishing opacity.
Density is authored, not accidental: particles are seeded along a weighted
distribution that leaves the upper-left quiet where the headline needs air, and
lets the current gather toward the lower right where the eye exits the scene.
Composition survives randomness only when the randomness is shaped, and shaping
it is the difference between a generative system and a noise generator.

Colour is carried by velocity. A particle moving with the field burns toward
chartreuse; one fighting a cross-current cools to mint. Both sit at opacities
low enough that fifty overlapping strokes are required before the ground shifts
at all — the accumulation *is* the image, and any single stroke is invisible.
This is a painstakingly calibrated restraint, and it is what separates an
atmosphere from a screensaver.

## Determinism as craft

Every field is addressed by a seed. The same seed yields the same field on every
machine, forever — a `mulberry32` generator and a hand-rolled value-noise
function, no library, no `Math.random()` anywhere in the draw path. This is not
merely reproducibility for its own sake. It means a specific field can be
*chosen*, reviewed, and committed, the way a photographer chooses one frame from
a contact sheet. A generative system that cannot be pinned down is a system that
cannot be art-directed.

## The discipline

The algorithm draws **once**. There is no animation loop, no per-frame
recomputation, no `requestAnimationFrame` running for as long as the tab is
open. The work is chunked across a handful of frames purely so it never blocks
the main thread on a mid-range phone over a Tanzanian mobile connection, and
then it stops forever. `docs/research/engineering-standards.md` names technical
restraint as one of the three things separating a premium build from an
expensive-looking one: *heavy effects only where they matter, so the rest of the
build stays fast enough for those moments to land.* A hero background that costs
a marketplace its scroll performance has inverted its own purpose.

Zero dependencies. Roughly four kilobytes. Every constant in it — octave
frequencies, the velocity-to-colour ramp, stroke alpha, the density weighting,
the step length that keeps curves smooth without oversampling — arrived at by
iteration, and each one is load-bearing. Change the alpha and the accumulation
collapses. Change the frequency ratio and the grid appears. That fragility is
not a flaw in the implementation; it is the signature of a system tuned to the
edge of what it can do, which is the only place worth tuning it to.
