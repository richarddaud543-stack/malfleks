# Soko Ltd — Engineering Standards Handbook

The shared record of how this team works and what it has learned. Every engineer
here starts each assignment without memory of previous ones, so anything learned
and not written down is paid for again. This file is where that knowledge lands.

## Working agreement

**Two-phase assignments.** No assignment begins implementation cold.

- **Phase 0 — Onboarding.** Research the current professional standards for your
  specific domain on the web (WebSearch / WebFetch) before writing any code.
  Record what you found, with sources, in your role's section below. Prefer
  primary sources — official framework docs, the WCAG spec, library changelogs —
  over blog aggregations, and prefer recent material: the stack moves, and
  training data goes stale.
- **Phase 1 — Build.** Implement, explicitly applying what Phase 0 established.
  Where research changed your approach, say so in your report.

**The gate.** Nothing merges to `master` without its Phase 0 research recorded
here. Research that contradicts the brief is the most valuable kind — report it
rather than quietly conforming.

## Roster and reporting lines

```
Soko Ltd — Engineering
└── Engineering Lead — assigns, reviews, integrates; sole writer to master
    ├── ENG-1 · Atlas     — Frontend & 3D (pages, components, motion, R3F)
    ├── ENG-2 · Mercury   — Data & business logic (src/data, src/lib, routing rules)
    ├── ENG-3 · Sentinel  — QA (Vitest, Playwright, accessibility, regressions)
    ├── ENG-4 · Forge     — Platform/backend (DB, auth, API)
    └── ENG-5 · Beacon    — SEO, metadata, design system, content
```

## Standing engineering baseline

Established by the 2026-08-13 standards pass and non-negotiable for new work:

- `npx tsc --noEmit`, `npm run lint` and `npm test` all clean before any hand-off.
- Every new page ships with page-specific `metadata`/`generateMetadata` (the root
  layout uses a `%s — Soko` title template) and a sitemap entry.
- Every new feature ships with at least one real test. Behaviour, not
  implementation detail; no assertions that are trivially true.
- Accessibility is part of done, not a follow-up: real labels, keyboard
  operation, announced errors, and the global `:focus-visible` ring left intact.
- `next/image` for real photography; the raw `<img>` inside the R3F `Html`
  portal in `HeroScene.tsx` is a documented, deliberate exception.
- Data provenance: the `verified: boolean` flag separates researched-real facts
  from illustrative placeholders. Never let invented data claim `verified`.
  Log sources in `src/data/SOURCES.md`.

## Technical debt register

Kept current by the Lead. Debt that is only mentioned in passing is debt nobody
ever pays down.

| # | Item | Risk | Status |
|---|---|---|---|
| 1 | No CI — every check runs by hand, locally, at the Lead's discretion | High. Nothing prevents a regression reaching `master` | **Done** (2026-08-14). `.github/workflows/ci.yml` runs types/lint/unit and E2E. Inert until #2 is closed |
| 2 | No git remote, no deployment | High. All work exists on one disk, unreviewed by anyone but us. Now also blocks #1 from ever running | Open — the next thing worth doing |
| 3 | `/agents` builds dynamic (ƒ) though it reads only static seed data | Low. Wasted server render; likely an accidental dynamic API call | Open, unassigned |
| 4 | UI merged without ever being viewed in a browser | Medium. Passing E2E is not the same as looking at the page | **Closed for the 2026-08-14 integrations** — `/locator` and the whole order flow were driven in a real browser before merge. Standing practice now, not a debt |
| 5 | Product imagery is a custom SVG icon set, not photography | Low. Deliberate; revisit before launch | Accepted |
| 6 | `SearchExplorer` is a client component calling `searchProducts()` with the default argument, so the entire catalogue ships in the browser bundle | Medium, and grows with the catalogue. Fine at 38 products, untenable at 38,000 | Open. Found by ENG-4 · Forge in Lead-authored code. `searchProducts` already takes `listings` as a second parameter, so the seam for a server/client split exists |
| 7 | `HeroScene.tsx` is a client component importing `brands` directly | Low. Same class of problem as #6; needs a prop drill | Open, found by Forge |
| 8 | The database and `src/data` are two sources of the same truth, kept in step only by `seedDatabase` and the repository tests | Medium. Atlas added `Branch.coords` while Forge's schema was in flight and the mirror silently diverged — caught only because those tests compare record for record | Open. Accepted while the UI still reads the static arrays; must be resolved, not papered over, when the site starts reading from the DB |
| 9 | `@react-three/fiber` constructs a `THREE.Clock`, deprecated in three r183, so every 3D page logs a deprecation warning | Low. Cosmetic, and not ours to fix: our own `useFrame` callbacks already take `delta` and never touch `state.clock` | Open, upstream. `@react-three/fiber@9.7.0` is the current release and still does this; revisit on the next R3F release rather than patching a dependency |

## Role research

Each section is written by the engineer who owns the role, at the end of Phase 0.
State the date, what you searched, what you concluded, and cite real URLs.

### Engineering Lead — delivery management (2026-08-14)

Researched how engineering leadership is actually practised now, specifically
for a team where most code is machine-generated. Four findings changed how this
project will be run, and each one contradicted something I was already doing.

**1. AI output destabilises delivery unless review and deployment capacity grow
with it.** The 2025 DORA report (~5,000 respondents) found AI adoption raises
individual effectiveness and code quality while *worsening* change failure rate
and rework — the cause being that generation outpaces the infrastructure meant
to absorb it. We have three agents generating code into a repo with **no CI and
no deployment**. That is the exact failure mode, and it means CI is not a
nice-to-have to slot in after the fun work; it is the precondition for the
parallel delivery we already started. This reverses the Lead's earlier
prioritisation, which put CI behind three feature sections.

**2. Review is the bottleneck, and AI code is specifically hard to review**
because it reads plausibly. LinearB's 2026 benchmarks put agentic-AI PR pickup
time at 5.3x unassisted. The recommended split: automate the mechanical checks
(format, lint, type, tests, security) and spend scarce human review on *intent
and architectural fit*. Applied here: the Lead stops hand-running `tsc`/lint/test
as the primary gate once CI exists, and reviews agent output for whether it
solves the right problem in the right shape.

**3. Long-lived parallel branches are the classic merge-hell anti-pattern.**
Trunk-based development calls for small batches integrated at least daily. We
currently have three long-lived worktree branches in flight. Mitigation:
integrate them **one at a time, immediately on arrival**, never batched up.

**4. Delegate technical decisions, intervene on cost, risk and cross-cutting
concerns**, and keep a maintained technical debt register — hence the table
above. The Lead's job is assignment, review, integration and risk, not
out-engineering the specialists.

Sources: [DORA metrics history](https://dora.dev/insights/dora-metrics-history/) ·
[DORA metrics in the AI era, DX](https://getdx.com/blog/dora-metrics/) ·
[Code review is the new bottleneck, MetaCTO](https://www.metacto.com/blogs/code-review-bottleneck-ai-development) ·
[How to review AI-generated code, CodeAnt](https://codeant.ai/blogs/how-to-review-ai-generated-code) ·
[Trunk-based development, DORA](https://dora.dev/capabilities/trunk-based-development/) ·
[Trunk-based development, Atlassian](https://www.atlassian.com/continuous-delivery/continuous-integration/trunk-based-development) ·
[Engineering management best practices, Jellyfish](https://jellyfish.co/library/software-engineering-management-best-practices/)

#### Integration round, 2026-08-14

All three parallel branches landed on `master` the same day, one at a time as
finding 3 requires — locator, then the order flow, then persistence. What the
integrations actually cost, recorded because the next round will cost the same
unless something changes:

- **Every branch needed Lead work to be shippable.** `/locator` was reachable
  only by typing the URL (no nav entry, no sitemap row) and five of its eight
  E2E specs failed on an accessible name assembled from sibling spans. The
  order form's error assertion collided with Next's route announcer. Forge's
  schema predated `Branch.coords` and its repository tests failed on merge.
  None of this showed up in the branches themselves — it is all seam damage,
  which is the argument for smaller batches, not for more review.
- **CI runs E2E against a production build**, not `next dev`. Dev compiles each
  route on first request; under parallel workers that read as four failures
  locally that all passed when re-run serially. A test suite that fails for
  reasons unrelated to the code is worse than no suite, because it teaches the
  team to re-run rather than to read.
- **Two `count()` calls raced client-side rendering** (search, locator). Fixed
  by waiting on something that settles first. `count()` does not retry — every
  other Playwright assertion does, which makes it the one call that needs a
  guard in front of it.
- **The workflow cannot run yet.** There is no remote (debt #2), so `ci.yml` is
  a file on a disk. Closing #2 is now the highest-value thing left.

### ENG-1 · Atlas — Frontend & 3D

_Pending Phase 0 for build work. The motion/3D landscape below was researched by the
Lead on 2026-08-14 at the user's request and stands as the shared Phase 0 baseline —
Atlas should build on it rather than re-derive it, and extend it where a specific
assignment needs more._

#### The animation stack, as it actually stands in August 2026

What we ship today: `motion` 13, `lenis` 1.3.26, `three` 0.185, `@react-three/fiber` 9.7,
`drei` 10.7, `@react-three/postprocessing` 3.0.

**GSAP** is now free for everything, including the formerly Club-only plugins
(SplitText, MorphSVG, DrawSVG, ScrollTrigger, ScrollSmoother), since April 2025 under
Webflow's ownership. The licence question that used to keep it out of commercial work is
gone. In React it must be used through `@gsap/react`'s `useGSAP()` — a drop-in for
`useEffect` wrapping `gsap.context()`, which handles StrictMode's double-invoke and
cleanup. Always pass `{ scope: ref }`, and wrap anything created in an event handler in
`contextSafe()` or it escapes the context and leaks.

**Motion** (`motion/react`) covers our current needs and stays the default for component
motion. Scroll-triggered work is `whileInView`/`useInView` on a pooled
IntersectionObserver; scroll-linked work is `useScroll` + `useTransform`, which runs on
the browser's native `ScrollTimeline` where available — off the main thread. We already
use `useReducedMotion()` in three places.

**React Spring** v10 is the spring-physics alternative, notable mainly for
`@react-spring/three`, which animates R3F objects directly. Worth reaching for if scene
motion ever needs to be physical and interruptible; not worth carrying alongside Motion
without that reason.

**Three.js**: `WebGPURenderer` has been production-viable since r171 with automatic
WebGL 2 fallback, and Safari 26 completed browser support; TSL compiles one node-graph
material to WGSL or GLSL. **The blocker for us is post-processing** — WebGPURenderer does
not run the legacy `EffectComposer`, which is what `@react-three/postprocessing` (our
Bloom, on both scenes) is built on. A WebGPU move means rebuilding the bloom on the TSL
node stack. Not a drop-in; not urgent.

**Anime.js v4** (rewritten, ESM, tree-shakeable — `animate()`, `createTimeline()`,
`createScope()`, `onScroll()`, `splitText()`, WAAPI bridge) and **Trig.js** (tiny,
IntersectionObserver sets a `--trig` CSS variable so the animation lives in CSS) are both
good libraries that duplicate what Motion already gives us here. Adding either needs a
concrete reason, not novelty.

**Lenis** is ours already. Options that matter: `lerp` (0.1), `duration` (1.2), `easing`,
`smoothWheel` (true), `syncTouch` (false), `autoRaf` (false), `anchors` (**false**),
`prevent`. If GSAP ScrollTrigger is ever introduced, the canonical wiring is
`lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add((t) => lenis.raf(t * 1000))`,
`gsap.ticker.lagSmoothing(0)` — ScrollTrigger and a smooth-scroll library that do not
share a ticker fight each other.

Sources: [GSAP + React](https://gsap.com/resources/React/) ·
[Webflow makes GSAP free](https://webflow.com/blog/gsap-becomes-free) ·
[Motion scroll animations](https://motion.dev/docs/react-scroll-animations) ·
[react-spring](https://github.com/pmndrs/react-spring) ·
[Anime.js v4 docs](https://animejs.com/documentation/) ·
[Trig.js](https://dev.to/idevgames/trigjs-tutorial-how-to-animate-on-scroll-aos-made-easy-50l) ·
[Lenis](https://github.com/darkroomengineering/lenis) ·
[Three.js WebGPU migration](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)

#### What separates premium sites from expensive-looking ones

Reviewed against Awwwards winners, studio write-ups and Codrops' 2026 build tutorials.
The finding is consistent and it is not about effect count:

1. **Art direction with a point of view** — every type, colour and grid decision serving
   one idea, carried from hero to footer.
2. **Choreography** — transitions that mean something, scroll sequences that pace a
   story, micro-interactions that reward attention.
3. **Technical restraint** — heavy effects only where they matter, so the rest of the
   build stays fast enough for those moments to land.

Structurally: **scene logic, not page logic**. Award sites are sequenced like films —
pacing, reveals, quiet moments — rather than organised as a tab hierarchy. The recurring
technical architecture is Lenis → ScrollTrigger on a shared ticker → one master timeline
split into overlapping phases (reveal / expand / content / settle) → WebGL planes
matched to the DOM elements they replace → **images preloaded before the timeline
starts**, because scroll animation over unloaded images reads as broken, not premium.

Two things worth taking seriously. First, the honest counter-case: immersive formats are
wrong for audiences hunting specific information and for teams without capacity to
maintain them — they age fast and then damage the brand. Soko is a marketplace, so the
3D belongs in the hero and the product showcase, not in the search results or the order
form, which is where it currently sits. Second, **almost none of these reference builds
address keyboard navigation, screen readers or `prefers-reduced-motion`.** We already do.
That is a differentiator to keep, not overhead to trim.

Sources: [Immersive website examples, Metabole](https://metabole.studio/en/blog/immersive-website-examples) ·
[Sticky Grid Scroll, Codrops](https://tympanus.net/codrops/2026/03/02/sticky-grid-scroll-building-a-scroll-driven-animated-grid/) ·
[Scroll-driven 3D image tube with R3F, Codrops](https://tympanus.net/codrops/2026/02/17/reactive-depth-building-a-scroll-driven-3d-image-tube-with-react-three-fiber/) ·
[Award-winning websites, judged](https://www.hontran.dev/blog/best-award-winning-websites-2026)

#### Two defects this research turned up, fixed the same day

Reading the Lenis docs prompted a check of how in-page anchors behave under smooth
scroll. `anchors` defaults to `false`, so the **skip-to-content link scrolled the page
but left focus on `<body>`** — the next Tab went straight back to the nav the user had
just skipped, which makes the link worse than useless. `<main>` now carries
`tabIndex={-1}`. While verifying it in the browser, the tab read `All brands — Soko —
Soko`: two pages hardcoded the suffix that the root layout's `%s — Soko` template
already appends. Both now have E2E regression tests in `e2e/smoke.spec.ts`.

The lesson worth keeping: both bugs were invisible to the test suite and to every
screenshot, and both were found by opening the page and using it the way a keyboard user
would.

### ENG-2 · Mercury — Data & business logic

_Pending Phase 0._

### ENG-3 · Sentinel — QA

_Pending Phase 0._

### ENG-4 · Forge — Platform & backend

_Pending Phase 0._

### ENG-5 · Beacon — SEO, design system, content

_Pending Phase 0._
