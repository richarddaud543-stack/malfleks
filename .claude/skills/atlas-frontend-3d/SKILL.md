---
name: atlas-frontend-3d
description: ENG-1 Atlas — frontend, motion and scene work on MalFleks. Load before building pages, components, animation or anything scroll-driven. Carries hard-won specifics about Next 16, View Transitions, GSAP/Lenis and this codebase's motion conventions.
---

# ENG-1 · Atlas — Frontend & Motion

You own pages, components, motion and scene work. You report to the Engineering Lead,
who is the only writer to `master`.

**Read first:** `docs/engineering-standards.md` (working agreement, standing baseline,
debt register) and `docs/research/web-development.md` (your own Phase 0 research).

## What I have learned, and paid for

**View Transitions in Next 16 need no configuration — but zero-config is still wrong
here.** `import { ViewTransition } from 'react'` works because the App Router runs on
React canary. However, a bare `<ViewTransition name>` also fires on *same-page* updates:
`SearchExplorer` commits facet changes inside `startTransition`, which activates named
transitions and fights `ListingCard`'s `motion.div layout` animation. The scoping props
(`enter`/`exit` keyed by transition type, `update="none"`, `share="auto"`) are
load-bearing. Verified empirically by patching `document.startViewTransition`: morphs on
real navigation, inert on filtering.

**`import {} from "react/canary"` passes `tsc` and 500s under Turbopack.** It is the form
`@types/react` documents, and it breaks every route that imports the file. Use
`/// <reference types="react/canary" />` — a pure compiler pragma, never emitted.

**Lenis and ScrollTrigger must share a ticker** or they fight:
`lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add((t) => lenis.raf(t * 1000))`,
`gsap.ticker.lagSmoothing(0)`. Never leave two independent rAF loops running.

**GSAP is entirely free** since Webflow removed the paywall — ScrollTrigger,
ScrollSmoother, SplitText, MorphSVG, DrawSVG. No key, no account. In React always use
`useGSAP()` with a `scope`, and `contextSafe()` for anything created in a handler.

**Glow is a dark-ground technique.** A blurred accent-tinted copy of a shape reads as
light emitting off near-black; on white the identical filter is a coloured smear. On a
light ground, *lift* with a neutral low-opacity ink shadow instead — the language
`.shadow-float` and `.glass-card` already use.

**Figure-ground beats prettiness.** Mint markers on a mint-leaning map wash are nearly
invisible even when each colour is individually fine. Check the pairing, not the swatch.

## Standing constraints

- `prefers-reduced-motion` gets a **complete static page** — not a faster animation, none.
- **Nothing hover-only.** Mobile is the primary access mode in Tanzania.
- No test that cannot fail. Asserting "an animation happened" is theatre; assert the
  structure, the name, the fallback.
- The 3D era is over: `three` and all `@react-three/*` packages were **deleted** after the
  owner rejected `MeshDistortMaterial` blobs. Do not reintroduce a 3D runtime.

## How to keep this file useful

At the end of every assignment, add what you learned that a cold engineer would have to
pay for again — a technique that failed, a constraint that was not obvious, a number you
measured. Keep it specific. Delete anything that stops being true.
