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
    ├── ENG-5 · Beacon    — SEO, metadata, design system, content, IA
    └── ENG-6 · Prism     — Visual & graphic design (type, colour, composition)
```

Prism is a 2026-08-14 addition. Beacon owned "design system" alongside SEO, content
and information architecture, which is two jobs; the visual half now has its own seat.
Beacon keeps structure — IA, wireframes, metadata, content — and Prism owns the look.

Long-form role research lives in `docs/research/`, one file per discipline, linked from
each role's section below. It is kept out of this file so several engineers can research
in parallel without four of them editing the same document.

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
| 10 | Brand accent colours are used as borders and marker fills in `CityLocator.tsx` (106–107) and `TanzaniaMap.tsx` without any contrast guard | Low–medium. Same class as the icon-fill defect Prism found, which was real; these specific spots are **uncomputed**, so this is a suspicion, not a finding | Open, unassigned. `iconAccent()` in `src/lib/accent.ts` is the tool; the work is deciding the right threshold for a border vs an icon |
| 11 | No mutation testing — nothing checks whether our tests would catch a deliberately wrong implementation | Low, rising. Proposed by Forge as the structural answer to an agent writing a test that trivially passes against the code it just wrote | Open. Scope to `src/server` and `src/lib`; sequence after #2 |
| 12 | No cross-route view transitions — the icon tile on a card and the same product's page have no visual relationship | Low. Pure craft, but it is the one page-to-page gap the current stack cannot close | Open, unassigned. Native browser API via React's `<ViewTransition>`, no new dependency (Atlas, verified against the local Next 16 docs) |
| 13 | The delivery route is computed only on `/delivery/[productId]`, one page after the customer decides | Medium. `resolveDeliveryRoute()` already answers "brand fleet or which courier" — the answer just arrives after the choice it should inform | Open, found by Beacon. The highest-value item from the UX research |
| 14 | **Two persistence stacks, neither read by a page**: Prisma 7 + SQLite (`src/server/`, `prisma/`) and now the Firebase SDK wired to project `v-mall-f37c6` | High, and the expensive kind of ambiguity — both look equally live to anyone opening the repo, so the next engineer builds against whichever they find first. This is debt #8 with a second head | **Open, needs a decision from the owner, not an engineer.** If Firestore is the backend, retire the Prisma layer deliberately and record why. If Firebase is only hosting/analytics, say so in `docs/backend.md` and scope it there |
| 15 | Firebase Analytics runs for every visitor with no consent gate | Medium, jurisdiction-dependent. Analytics sets identifiers on load; Soko's market is Tanzania but the site is reachable anywhere | Open. `FirebaseAnalytics.tsx` is a single mount point and `initAnalytics()` already returns `null` when unavailable, so a consent check has one obvious home |
| 16 | No Firebase Security Rules or App Check in the repo | High **if** Firestore/Storage get real data. The web API key is public by design; rules are the only thing protecting the project | Open. Nothing reads Firebase data yet, so this is a precondition for the first read, not a bug today |

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

**Phase 0 recorded 2026-08-15 → [`docs/research/web-development.md`](research/web-development.md),
building on the Lead's 2026-08-14 motion-stack research below.**

Atlas expected the 3D/motion layer to be the risk area and found the opposite: the R3F
code is the well-handled part (`next/dynamic` with `ssr: false` behind a
`useReducedMotion()` gate, so neither Three.js nor its scene graph ships to a user who
asked for reduced motion). Where current practice actually disagrees with this repo is
plainer — **two client components importing data they should receive as props**
(debt #6, #7) — and the fix is moving an import, not adopting a library. The Next.js docs
name the mechanism precisely: a Server Component passed as `children`/prop to a Client
Component is *not* pulled into the client bundle.

New and actionable: **View Transitions need no configuration in the App Router** — the
Lead verified this against `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`,
which states it plainly and gives `import { ViewTransition } from 'react'`. Today,
clicking a product card is a cold navigation: the accent-tinted icon tile on the card and
the same product's showcase have no on-screen relationship. That is the one gap the
existing stack cannot close, because it is a browser API rather than an animation
library's job — and it costs no new dependency, which is exactly the "technical
restraint" the craft research argued for.

Also flagged: `OrderRequestForm` is a fully client-side form whose validation
(`src/lib/order.ts`) is already shaped to become a Server Action with `useActionState`.
Worth doing **as part of** wiring real persistence, not as a standalone refactor of code
that works correctly today.

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

**Phase 0 recorded 2026-08-15 → [`docs/research/software-engineering.md`](research/software-engineering.md).**
Learned the discipline rather than a framework: architecture, testing strategy, delivery,
and specifically how practice changes when most code in a repo is machine-generated —
which is our literal situation.

The finding worth carrying: four independent sources (Farley, Beck, Thoughtworks Radar
Vol. 34, DORA-adjacent benchmarking) converge on one mechanism — **generation capacity
outruns verification capacity**, and tests are the one artifact an agent cannot talk its
way around. Beck's specific observation is that an agent asked to make tests pass will
weaken or delete the inconvenient test rather than solve the problem. Thoughtworks names
the compounding version "cognitive debt", and its *team of coding agents* entry describes
this repo almost exactly, naming **architecture drift** — agents replicating whatever
pattern is already present, degraded ones included — as the main risk.

Forge went looking for a respectable case that heavy test discipline is overhead when
agents can regenerate code cheaply, and did not find one. That is a point in favour of
the standing baseline, arrived at by trying to falsify it.

One new practice proposed and accepted onto the register: **mutation testing** as a check
on the test suite itself, scoped to `src/server` and `src/lib`. It is the structural
answer to the Beck failure mode. Not before debt #2.

Sourcing honesty: no YouTube transcript was retrievable. Everything attributed to Beck
and Farley comes from newsletter and podcast write-ups that quote them directly, and the
Radar specifics for two entries come from search summaries rather than full pages —
flagged as such in the document.

### ENG-5 · Beacon — SEO, content, information architecture

**Phase 0 recorded 2026-08-15 → [`docs/research/wireframing-and-ux.md`](research/wireframing-and-ux.md).**

Three findings worth acting on. **A dynamic UI needs a wireflow, not a wireframe** —
NN/g draws the line explicitly, and our undocumented state machines (`SearchExplorer`,
`CityLocator`, `OrderRequestForm`) are exactly the case plain wireframes handle badly:
nothing outside the code describes the URL-sync or focus-on-error behaviour.
**Breadcrumbs are conditional, not decorative** — useless below 2–3 tiers, valuable
beyond, and our real depth is six (`Home → Brands → Brand → Branch → Product → Delivery
→ Confirmation`) with an inconsistent back-link pattern; the brand page is the one
detail page missing it. And **the delivery route is computed one page too late**:
`resolveDeliveryRoute()` decides brand-fleet vs courier, but only on
`/delivery/[productId]`, after the customer has already committed to a product — the
answer belongs on `/products/[id]`, where the decision is actually made.

Beacon also checked whether we make the classic mobile-first error of porting one UI to
every breakpoint, and found we do not — `Navbar` and `SearchExplorer` genuinely diverge
per breakpoint. A finding that confirmed the codebase rather than contradicting it.

### ENG-6 · Prism — Visual & graphic design

**Phase 0 recorded 2026-08-15 → [`docs/research/graphic-design.md`](research/graphic-design.md).**

Prism's audit found a real, computed accessibility defect rather than an opinion about
taste, which is the standard this seat exists to meet: **brand accent colours were being
used as the product-icon fill on a chip tinted with that same accent**, so a dark accent
drew a dark shape on a dark ground.

The Lead re-computed every brand independently and the finding held — and went one
further than the report:

| Brand | Accent | Icon on its own chip |
|---|---|---|
| Apple | `#1D1D1F` | **1.12:1** — fails |
| Ford | `#003478` | **1.56:1** — fails |
| BMW | `#0066B1` | 3.01:1 — borderline |
| Toyota | `#EB0A1E` | 3.98:1 |
| Halotel | `#00A651` | 5.39:1 |
| Oraimo | `#0BC5A0` | 7.54:1 |

Prism reported only Apple; Ford fails the same way and was missed. **Verify a
contributor's numbers by re-deriving them, not by re-reading them** — the method was
right and the sweep was incomplete, which is the failure mode a spot-check catches and a
proofread does not.

The neutral palette, which the team had assumed was the risk, is fine: `--foreground`
18.14:1, `--muted` 7.72:1, `--accent` 7.86:1 on `--background`. The two tokens Prism
left uncomputed are also fine — `--accent-2` 6.08:1, `--accent-3` 8.67:1 (Lead-computed).
The danger was never the core tokens; it is **unvalidated brand data reaching a
foreground role**, which nothing in the token system guarded against.

Fixed in `src/lib/accent.ts`: `iconAccent()` returns the accent untouched when it already
clears 3:1 against its own chip, and otherwise the least-lightened variant that does.
Only Apple (`#616162`) and Ford (`#3d6598`) change. A test asserts the property for every
brand in the catalogue, so a seventh brand with a dark accent fails the suite instead of
shipping an invisible icon.
