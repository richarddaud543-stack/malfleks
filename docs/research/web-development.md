# Web development — Phase 0 research (ENG-1 · Atlas, 2026-08-15)

Scope: what the strongest web-dev teaching is saying in 2025–2026, and where it
argues for a different approach than what's in this repo today. I read the
code in `src/app`, `src/components` and `src/lib` before writing section 3 —
claims about our code are grounded in specific files, not assumption.

I could not watch or transcribe any actual YouTube video — I have no video
player. Everywhere below, "verified" means I fetched a real page (docs,
official guide, channel/course description) and I'm reporting what it says.
Where I'm relaying a *description* of a channel's content rather than
something I read directly, I say so.

## 1. Who to learn from

Could not verify by watching. These are the names that came up consistently
across independent 2026 "best of" roundups and cross-referenced each other,
which is the best confidence signal available without a transcript:

- **Kevin Powell** — CSS specifically, and the best-regarded teacher for it.
  2026 output centers on container queries, `:has()`, native CSS nesting,
  subgrid, anchor positioning, and scroll-driven animation — i.e. CSS
  absorbing work that used to require JS. Speaking on this at ZurichJS Conf,
  Sept 2026.
- **Sara Soueidan** — accessibility and inclusive UI, from a CSS/markup angle
  rather than a testing-checklist angle. Her "Practical Accessibility" course
  and "The Other C in CSS" talk (how CSS itself affects accessibility, not
  just HTML/ARIA) are the two most-cited entry points.
- **Adrian Roselli** — accessibility from the standards/WCAG side; useful as
  the counterweight to Soueidan's implementation focus.
- **Theo (t3.gg)** — opinionated Next.js/React commentary, strong on where
  the framework ecosystem is actually going vs. marketing claims. I could not
  find a specific verifiable 2026 clip to cite, so I'm not attributing any
  claim to him here — noting the channel as one professionals reference, not
  more.
- **Web Dev Simplified (Kyle Cook)**, **Traversy Media**, **Academind**,
  **freeCodeCamp** — the general-purpose channels every roundup lists for a
  reason: breadth and teaching quality, not novelty. Good for onboarding, not
  where the frontier findings below came from.

I'm treating this list as directional, not vetted — I didn't watch a single
video end to end. What follows in section 2 comes from primary docs and specs
I actually fetched, which is a stronger form of evidence than a channel
recommendation.

## 2. What current practice says

### The Server/Client boundary is the main lever on bundle size

Next.js's own guidance (fetched 2026-08-15,
[nextjs.org/docs/app/getting-started/server-and-client-components](https://nextjs.org/docs/app/getting-started/server-and-client-components),
doc dated 2026-08-11) is specific about the mechanism, not just the
principle: once a file has `"use client"`, *everything it imports and
directly renders* joins the client bundle — but a Server Component **passed
as a child or prop** to a Client Component is not pulled in; it's rendered on
the server and handed over as already-rendered output. The documented pattern
for this is a Client Component that accepts `children` as a slot, with a
Server Component parent supplying the content. This is the "leaf, not
trunk" placement of `"use client"` that shows up across every 2026
RSC-pattern piece I found (jsmanifest, PkgPulse, several others) — but those
are secondary sources; the mechanism above is from the primary doc.

### Server Actions + `useActionState`, not client-side fetch-and-navigate, is the documented form pattern

Fetched 2026-08-15,
[nextjs.org/docs/app/guides/forms](https://nextjs.org/docs/app/guides/forms)
(doc dated 2026-07-28). The shape: a `<form action={serverFn}>` where the
Server Function receives `FormData` directly; validation runs server-side
(the doc's example uses Zod) and returns `{ errors }`; the calling component
becomes a Client Component only to read that result via
`useActionState(action, initialState)`, which also exposes `pending` for the
submit button. This degrades gracefully without JS because the `action`
attribute is native `<form>` behavior — not true of an `onSubmit` handler
that calls `router.push`.

### INP is graded on the whole page lifecycle now, not just first input

Fetched 2026-08-15, [web.dev/articles/inp](https://web.dev/articles/inp)
(updated 2025-09-02). Thresholds unchanged — good ≤200ms, poor >500ms, scored
at the 75th percentile of real visits — but per independent 2026 coverage of
the May 2026 CrUX methodology update (not from web.dev itself, so weaker
sourcing), INP now weights *sustained* interaction latency more than the
first click, which surfaces problems in things like heavy filter UIs and
sticky-header scripts that a "time to first interaction" number used to
hide. 28% of measured origins still fail LCP and 28% fail INP as of that
report.

### The browser's View Transitions API is now a documented Next.js pattern with zero new dependencies

Fetched 2026-08-15,
[nextjs.org/docs/app/guides/view-transitions](https://nextjs.org/docs/app/guides/view-transitions)
(doc dated 2026-08-07) and
[nextjs.org/docs/app/api-reference/components/link#transitiontypes](https://nextjs.org/docs/app/api-reference/components/link).
This works in the App Router **with no config** — Next runs on React canary,
which already has React's `<ViewTransition>`. Four named patterns: shared-
element morph (`name` prop, same value on both pages — browser animates
size/position automatically), Suspense-boundary reveal (skeleton exits,
content enters), directional slides via `<Link transitionTypes={[...]}>`
(forward/back semantics), and same-route crossfade via a `key`-swapped
`ViewTransition`. `prefers-reduced-motion` is handled by zeroing
`animation-duration` on the `::view-transition-*` pseudo-elements — same
mechanism the rest of the stack already respects, just a different
selector family.

### CSS is absorbing animation and layout work that used to require JS

Weaker sourcing here — secondary 2026 roundups (cssawwwards.com,
locallylost.com) rather than a spec I fetched directly, but they agree on
direction: container queries and `:has()` are now baseline-usable, and
scroll-driven animation (`animation-timeline: view()` / `scroll()`) covers a
chunk of what a JS scroll library exists for, at the cost of narrower
Firefox support than Chromium/Safari. Kevin Powell's ZurichJS talk
description frames this explicitly as "less JS, CSS reads and reacts to
values directly."

### Accessibility teaching in 2026 treats CSS as an accessibility surface, not just markup/ARIA

From Sara Soueidan's "The Other C in CSS" talk description (fetched via
search, not the talk itself) — the framing is that layout and motion
decisions (focus order implied by DOM/visual order mismatch, motion that
`prefers-reduced-motion` doesn't catch because it's a layout shift rather
than an animation, contrast against dynamic backgrounds) are accessibility
bugs even when every element has a correct role and label. I can't verify
specifics beyond the framing, but it's consistent with what the handbook
already practices here — see section 4.

## 3. What this means for Soko

**`SearchExplorer` (`src/components/search/SearchExplorer.tsx`) and
`HeroScene` (`src/components/three/HeroScene.tsx`) are the textbook version
of the anti-pattern the Next.js docs name directly.** This isn't a new
finding — both are already on the debt register (#6, #7) — but the research
gives a concrete fix shape instead of just "split it": `SearchExplorer` is
`"use client"` at the top (line 1) and calls `searchProducts(filters)`
directly (line 94-97), which is why the whole catalogue ships to the browser.
`searchProducts` already takes `listings` as an optional second argument
(`src/lib/search.ts` line 259-262), so the seam is there. The documented
pattern is: keep `SearchExplorer` as the client shell for the URL-state
machinery (`useOptimistic`, debounce, the filter panel), but have it accept
the *rendered* facet panel and result list as `children`/props from a Server
Component parent that calls `getListings()`/`searchProducts()` server-side —
not have the client component call the search function itself. Same fix
shape for `HeroScene` (line 16: `import { brands } from "@/data"` inside a
`"use client"` file) — `brands` should come in as a prop from
`HeroSceneLoader` or the page, not be imported into the client module graph.
I'd prioritize `SearchExplorer` first: it scales with the catalogue (debt
register already flags 38 products fine, 38,000 not), `HeroScene`'s payload
(6 brand logos) doesn't.

**`OrderRequestForm` (`src/components/order/OrderRequestForm.tsx`) doesn't
match the documented form pattern, and this is worth fixing before Forge
wires it to real persistence, not after.** Right now it's fully client-side:
`"use client"`, local `useState` for every field, `handleSubmit` calls
`validateOrderRequest` from `src/lib/order.ts` in the browser, then writes to
`sessionStorage` and does `router.push("/order/confirmation")` — there's no
server round-trip at all yet, which is fine while the backend is groundwork
(debt #8) and not read by the UI. But the validation logic in
`src/lib/order.ts` (`validateOrderRequest`, exported and already pure) is
already shaped correctly to become a Server Action: pass it `FormData`,
return `{ errors }`, drive the form with `useActionState` instead of
`useState` + manual `attempted` tracking. The current manual-focus-on-error
logic (lines 76-80) and the `attempted` flag (line 55) are exactly the
bookkeeping `useActionState`/`useFormStatus` remove. I'd flag this for
whoever wires the real submit path — Forge or whoever owns that integration
— rather than change it myself, since the brief is research, not a rewrite,
and this component works correctly today for what it does.

**There is no cross-route transition anywhere in the site, and the fix costs
zero new dependencies.** Clicking a search result (`ListingCard`, which
already has a `motion.div` with `layout` — but that only choreographs
same-page reordering, not a navigation) or a product card takes the user to
a fully fresh page with no visual continuity — the tinted icon tile on the
card and the `ProductShowcaseLoader` scene on `/products/[id]` have no
relationship on screen even though they represent the same product. The
Next.js View Transitions guide (section 2) is directly applicable: wrap the
accent-tinted icon box in `ListingCard`/`ProductCard` and the equivalent
element on the product page in `<ViewTransition name={`product-${id}`}>`,
and the browser morphs position/size automatically — no GSAP, no new
animation library, and it sits squarely inside what the Lead's research
called "technical restraint": the site already has the choreography
vocabulary (Motion, ScrollReveal), this is the one gap — page-to-page — that
none of the existing stack covers, because it's a browser API, not a React
animation library's job. This is worth a dedicated small task, not a
drive-by change, since it touches the shared card components used across
`/search`, `/brands/[slug]`, and the homepage grid.

**`next.config.ts` is the default scaffold — empty apart from the type
import.** Nothing here is wrong, but it means none of Next 16's
performance-relevant opt-ins (`images.formats`, cache/PPR-related config)
are decided one way or the other; worth a deliberate look rather than
leaving it as an accident of `create-next-app`, next time someone is in
performance work.

**What's already right, worth naming so it doesn't get "fixed" by mistake:**
`HeroSceneLoader.tsx` and `ProductShowcaseLoader.tsx` both do exactly what
current RSC/bundle-size teaching recommends for a heavy client dependency —
`next/dynamic(..., { ssr: false })` behind a `useReducedMotion()` gate, so
neither Three.js nor its scene graph ships to a user who's asked for reduced
motion, and initial HTML never waits on the 3D bundle. `src/app/brands/[slug]/page.tsx`
uses `next/image` with `priority` and a correct `sizes` on the one image
that's actually above-the-fold LCP-critical (line 54-61) — the exact
"prioritize the LCP image" advice from the Core Web Vitals research is
already applied there. And `OrderRequestForm`'s accessibility wiring
(`aria-describedby` built from hint/error ids, `role="alert"` on the summary
line, explicit focus-to-first-error on failed submit) matches what the
accessibility research above calls out as the harder, less-obvious layer —
this isn't a form with labels bolted on, the error/hint relationships are
actually wired.

## 4. Where I was wrong

I expected to find that Soko's client/server split was mostly fine and the
3D/motion work was the risk area, because that's what the Lead's existing
research emphasizes and it's my own domain. Reading the actual component
tree reversed that: the R3F code is the *well-handled* part (proper dynamic
import, proper reduced-motion fallback, the one documented raw `<img>`
exception is genuinely justified and commented as such). The place current
practice actually disagrees with this repo is plainer and less exciting —
two client components importing data they should be receiving as props —
and the fix isn't a new library or technique, it's moving an import three
files. I came in expecting the research to point at Three.js/motion
choices; it pointed at ordinary React composition instead.

I also expected the View Transitions API to still be experimental-only
(`unstable_ViewTransition`) given how recently it landed in React. The
Next.js guide fetched today states it working in the App Router "with no
configuration" because the App Router already runs on React canary — that's
a meaningfully lower bar to ship it than I assumed going in, which changes
its priority from "watch and wait" to "small task, worth doing soon."
