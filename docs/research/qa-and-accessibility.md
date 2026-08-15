# QA & Accessibility — Phase 0 research

**ENG-3 · Sentinel, 2026-08-15.** Read every test in the repo first (15 Vitest
files / 182 tests, 5 Playwright specs / 28 tests), ran both suites, then did
~11 web lookups against primary sources before writing this. Section 3 is the
part worth reading closely — it audits what we actually have, not what good
practice says in the abstract.

## 1. Who to learn from

Primary sources, all fetched directly this session:

- [Playwright — Best Practices](https://playwright.dev/docs/best-practices) — test isolation, web-first assertions, locator strategy.
- [Playwright — Accessibility testing](https://playwright.dev/docs/accessibility-testing) — the official `@axe-core/playwright` integration guide and its own stated limits.
- [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles/) and [Query priority](https://testing-library.com/docs/queries/about/#priority) — "the more your tests resemble the way your software is used, the more confidence they can give you," plus the `getByRole` → `getByTestId` ordering.
- [W3C WAI — Evaluating Web Accessibility](https://www.w3.org/WAI/test-evaluate/) — the standards body's own position on tool vs. human evaluation.
- [WebAIM Million](https://webaim.org/projects/million/) — the only source here that's an actual empirical study (top 1M home pages), not a vendor or blog opinion.
- [Deque — axe-core API docs](https://www.deque.com/axe/core-documentation/api-documentation/) — useful for the mechanics of `incomplete`/review-item results, though it makes no quantified coverage claim itself; treat as a reference doc, not a benchmark.

Secondary, used only for stats and 2026-context that the primary sources
didn't state directly (search-summary aggregation, not a fetched page I can
quote verbatim) — **flagged as secondary, cross-check before citing further**:
testguild.com, qaskills.sh, getautonoma.com, bug0.com and similar SEO-content
sites on axe coverage percentages and visual-regression practice. None of
these are video-derived; I made no video-based claims anywhere in this
document because I cannot watch video and did not attempt to.

## 2. What current practice says, by theme

### Playwright & anti-flake
Official guidance: isolate every test (own storage/cookies/session, no
cascading dependencies), prefer role-based/user-facing locators over CSS or
XPath, and lean on web-first assertions (`toBeVisible()`, `toHaveURL()`, …)
because they auto-retry — the opposite of a raw `isVisible()` check or a
non-retrying call like `.count()`. Source:
[playwright.dev/docs/best-practices](https://playwright.dev/docs/best-practices).

Our own suite already has a documented instance of exactly the retry gap the
guidance warns about — `count()` never retries, and both `search.spec.ts` and
`locator.spec.ts` carry comments explaining why a `toHaveURL`/`getByRole
("status")` wait has to run first. I reproduced the *other* flakiness class
myself: a fully-parallel `npx playwright test` run against `next dev` failed
2 of 28 tests (`locator.spec.ts:101`, `search.spec.ts:54`, both `toHaveURL`
timeouts on the first request to a not-yet-compiled route). Re-running just
those two with `--workers=1` passed both in under 3 seconds. That is precisely
the failure mode the Lead documented in the 2026-08-14 integration notes, and
CI is already correctly configured around it (`npm run start` against a
production build, not `next dev`). **No real regression — a live
confirmation that the documented mitigation is scoped correctly.**

### Testing Library — behaviour, not implementation
Query priority, in order: `getByRole` → `getByLabelText` →
`getByPlaceholderText` → `getByText` → `getByDisplayValue` → `getByAltText` /
`getByTitle` → `getByTestId` last. `getByTestId` exists because "the user
cannot see (or hear) these" — it's an escape hatch, not a default. Source:
[testing-library.com/docs/queries/about/#priority](https://testing-library.com/docs/queries/about/#priority).

Soko's suite matches this closely. `CityLocator.test.tsx` and
`OrderRequestForm.test.tsx` reach for `getByRole`/`getByLabelText` first and
only fall back to `data-testid` (`locator-branch`, `order-line-total`,
`brand-delivery-panel`) for whole-card or whole-region groupings that have no
single accessible role of their own — the narrow, correct use case, not
overuse.

### Accessibility testing — what automation actually catches
Three sources converge on the same range: automated tools (axe-core and
similar) catch roughly **20–40% of WCAG failures**; one industry comparison
put axe-core alone at 22.6% against a manual-audit baseline (secondary,
indicative not precise). The primary sources are blunter. W3C WAI, verbatim:
> "no tool alone can determine if a site meets accessibility standards.
> Knowledgeable human evaluation is required to determine if a site is
> accessible." — [w3.org/WAI/test-evaluate](https://www.w3.org/WAI/test-evaluate/)

WebAIM Million (empirical, top 1M home pages) names the six categories that
account for 96% of everything it *can* automatically detect — low contrast
text (83.9% of pages), missing alt text (53.1%), missing form labels (51%),
empty links (46.3%), empty buttons (30.6%), missing document language
(13.5%) — and states plainly: "Absence of detected errors does not indicate
that a page is accessible or conformant."
[webaim.org/projects/million](https://webaim.org/projects/million/)

The practical pipeline several sources converge on: **automated scan first**
(cheap, catches the mechanical ~30%) → **keyboard-only pass second** (focus
order, traps, visible focus, real operability) → **screen-reader pass
third** (announcement quality, live-region behaviour, context that only a
human ear catches). Playwright's own accessibility guide names axe-core as
the automated layer and is explicit that automated results need combining
with manual assessment.
[playwright.dev/docs/accessibility-testing](https://playwright.dev/docs/accessibility-testing)

### Visual regression
Current tooling is Playwright's own `toHaveScreenshot()` — pixelmatch
diffing, no extra service needed. 2026 guidance: generate baselines in CI
(not on a developer's machine, for cross-platform font/rendering
consistency), commit baselines as reviewed source, prefer element-level over
full-page screenshots, and spend the budget on high-value/high-traffic flows
rather than everything. (Secondary sourcing — search-summarized, several
consistent 2026 guides, no single page fetched verbatim.)

### Testing strategy for AI-generated code — the QA-specific angle
This sharpens rather than repeats Forge's Phase 0 finding (`docs/research/
software-engineering.md`). The specific mechanism: when the same generation
pass writes the code and its test, the test validates *what the code does*,
not *what it should do* — because the model has no access to the original
requirement, only the code it just wrote, so whatever that code returns
becomes the "expected" value. The result is tests that are green, look
thorough, and prove almost nothing: tautological assertions, tests that
re-derive the expected value from the same function under test, mocked-away
logic, high line coverage with zero behavioural coverage. Mutation testing —
already proposed by Forge and sitting as debt #11 — is the review strategy
these sources converge on independently, specifically because it objectively
measures whether a test would catch a deliberately wrong implementation
rather than trusting that it would. (Secondary — search-summarized across a
handful of 2026 QA-practice write-ups; no single primary standards body
covers this yet, unsurprisingly, since it is a very recent problem class.)

## 3. Audit of Soko's actual test suite

Numbers, verified by running both suites myself, read-only: **15 Vitest files
/ 182 tests, all pass** (28.2s). **5 Playwright spec files / 28 tests** — 26/28
pass on a fully-parallel run against `next dev`; both failures reproduce the
documented dev-server-compile flakiness and pass cleanly serially (see
above) — **28/28 with `--workers=1`.** No real regression found. 67
non-test `.ts`/`.tsx` files sit under `src/components` and `src/app` against
those 15 test files — a bit under a third of components carry a dedicated
unit/component test; the rest lean on E2E, which is defensible for pure
layout/composition pieces and less so for interactive ones (see gaps below).

### Where coverage is genuinely load-bearing
- **`src/lib/order.ts`** (`order.test.ts`) is the strongest file in the repo:
  every real Tanzanian mobile prefix, every quantity edge case, reference-code
  generation excluding characters that could be misheard on a phone call, the
  full validation error surface reported all-at-once rather than
  first-error-only, and a storage round-trip test that also asserts
  corrupted/missing-field records are rejected rather than crashing the
  confirmation screen. This is core business logic tested like it's core
  business logic.
- **`resolveDeliveryRoute()`** — the actual brand-fleet-vs-courier decision —
  is tested at three independent altitudes: unit (`order.test.ts`), component
  (`OrderRequestForm.test.tsx`, `OrderConfirmation.test.tsx`), and E2E
  (`delivery-routing.spec.ts`, `order.spec.ts`). That is the textbook shape
  for a core rule: the unit test proves the logic, the component tests prove
  it's wired to the right UI state, the E2E tests prove it survives real
  navigation and hydration. This is the one place I'd hold up as the model to
  copy elsewhere, not the risk area I expected going in.
- **`src/server/repositories/repositories.test.ts`** runs against a real
  SQLite database built from the committed migration and the real seed
  script — nothing mocked. It directly guards debt #8 (two sources of the
  same truth) and, per the debt register, already caught a real divergence
  once (`Branch.coords`). A mocked Prisma client would have proven nothing
  here; this test earns its runtime.
- **`src/lib/accent.ts`** (`accent.test.ts`) computes real WCAG contrast
  ratios and asserts every brand in the catalogue clears 3:1 against its own
  icon chip. This is exactly the class of test that would have caught the
  Apple/Ford icon-contrast defect before Prism found it by eye, and now
  blocks a seventh brand from shipping the same thing. Load-bearing, not
  theatre.

### Where it is closer to theatre, or thin
- **`DeliveryBadge.test.tsx`** asserts a Tailwind class string is present
  (`text-emerald-400` / `text-amber-400`). That's coupled to an implementation
  detail (a CSS class name), not behaviour — it would pass under a themed
  override that made the two badges visually indistinguishable, and could
  fail on a harmless class-name refactor. Testing Library's own guidance
  argues against exactly this pattern. Cheap fix: assert the accessible text
  and, if colour genuinely matters, assert computed style rather than a
  class-name substring.
- **`ProductIcon.test.tsx`** proves a known icon renders and an unknown one
  falls back — both useful, both crash-guards. But it never asserts which SVG
  path corresponds to which product category beyond one hardcoded pair
  (`smartphone`/fallback). If the `sedan` and `suv` icon mappings were
  swapped, nothing here would notice.
- The single **console-error check** in `smoke.spec.ts` only runs on `/`. A
  hydration mismatch, an R3F/Three.js warning escalating to `console.error`,
  or a Firebase Analytics failure on `/locator`, `/search`, or
  `/products/[id]` would ship silently today. This is a five-line helper
  (already half-written as `collectConsoleErrors` in `smoke.spec.ts`) away
  from covering every spec, not a new capability.
- Locator/search "shows N results" assertions bake in exact seed-data counts
  (19 branches, "6 branches in Arusha", etc.). Good for catching a real
  regression today; it also means every one of those tests needs a manual
  update the moment the catalogue grows, which is coupling to fixture size,
  not product behaviour — worth watching as debt #6's dataset-size trajectory
  plays out.

### Regression that would slip through today
- **A page-title regression on any route other than `/brands` and
  `/agents`.** I checked: ten routes set page-specific `title` metadata
  through the `%s — Soko` layout template (`/locator`, `/search`,
  `/delivery/[productId]`, `/products/[id]`, `/brands/[slug]`,
  `/brands/[slug]/branches/[branchId]`, `/order/confirmation`, `not-found`,
  plus the two already covered). Only the two are asserted with
  `toHaveTitle()`. **The exact bug that just escaped the suite is only
  guarded on the two pages where it happened to be found**, not on the
  mechanism. This is the single highest value-per-effort gap in the whole
  audit — see §4 below.
- **A console error on any route besides `/`,** as above.
- **A new brand's accent colour used unsafely as a border or marker fill.**
  `accent.test.ts` only guards `iconAccent()`. Debt #10 names the same class
  of risk, uncomputed, in `CityLocator.tsx` (106–107) and `TanzaniaMap.tsx` —
  nothing in the suite would catch a seventh brand shipping an invisible
  border or map marker even though its icon is now safe.
- **A regression in mobile `Navbar`/`Footer` behaviour.** No unit test exists
  for either, and every E2E spec runs at the default desktop viewport — none
  resizes. Beacon's UX research already flagged `Navbar` as one of the two
  components that genuinely diverge per breakpoint; that divergence is
  currently unverified by any test.
- **A hydration/console warning from the product-showcase 3D scene.** The one
  console-error check covers `/` (which does mount `HeroScene`), but no spec
  visits `/products/[id]` (which mounts `ProductShowcaseScene`) while also
  asserting on console output.

### Accessibility ground left untested
- **No automated accessibility scan exists anywhere.** I grepped
  `package.json`: `@axe-core/playwright`, `jest-axe`, and every axe variant
  are absent. Every accessibility assertion in this repo is a manually
  chosen role/label/aria-attribute check — the *right kind* of assertion per
  Testing Library's priority guidance, but only as complete as the list of
  things an author remembered to check, not as complete as a scan run against
  every rendered page.
- Cross-referenced against WebAIM Million's top categories: form labels are
  well covered (`OrderRequestForm.test.tsx`); one contrast property is
  precisely covered (`iconAccent()` only, not element-level contrast
  generally); nothing checks for empty links/buttons, alt text on
  `next/image` usage, or document language. (`<html lang="en">` is present —
  visible in my own Playwright run output — but nothing asserts it.)
- **No screen-reader-specific testing exists, and I could not run one** — no
  screen reader is available in this environment. Flagged explicitly under
  "could not verify," not silently skipped.
- **No test proves real Tab-key operability through the multi-step order
  form.** `OrderRequestForm.test.tsx` uses `fireEvent.click()`/`fireEvent
  .change()` throughout; that proves the state machine works, not that a
  keyboard-only user can reach and operate every control in order. The two
  places real keyboard input is used (`locator.spec.ts`'s marker-focus test,
  `smoke.spec.ts`'s skip-link test) are the exception, not the pattern.

### The two bugs that escaped the suite
**Skip link moved scroll but not focus.** Not something an axe scan reliably
catches — axe's rule set flags a missing/duplicate skip link but doesn't
simulate "press Enter, then check computed focus." That puts it squarely in
the ~60–80% automated tools miss by design. The class of test that catches
it is exactly what got added: a Playwright test that presses a real key and
asserts `toBeFocused()` on the destination, not just `toHaveURL()` or scroll
position. **Worth adding more of, narrowly** — one such test per distinct
"jump" interaction (this skip link; any future in-page anchor or tab-panel
focus management), not a blanket policy change. It's cheap and high-signal
once the pattern exists, and the current test is a good template to copy.

**Doubled `<title>`.** Not an axe concern either — title format isn't a rule
axe evaluates; it's closer to an SEO/content-correctness bug that happens to
also matter to screen-reader users, who rely on the title as their first
orientation cue when switching tabs. The class of test that catches it is
mechanical: `toHaveTitle()` per route. It already exists for 2 of 10 titled
routes. **This is the single most worth-doing item in this whole audit** —
roughly eight more one-line assertions (or one table-driven loop over the
known routes) closes a gap with the *exact* bug class that already shipped
once, at close to zero cost.

## 4. Where I was wrong

- I expected the E2E layer to be the weakest, going in — usually the first
  thing cut under time pressure. It's actually the best-shaped layer here:
  the delivery-routing rule is tested at the right altitude (unit →
  component → E2E) already, which is unusual to find this early in a
  project.
- I expected some automated accessibility scanning (axe-core, at minimum) to
  already be wired in, given how careful the hand-written accessibility
  assertions elsewhere are (`aria-describedby` wiring, `focus-visible`
  checks, accessible names built from sibling content). It is entirely
  absent. Having now read the actual coverage numbers — automation reaches
  maybe 20–40% of WCAG issues — I think this is a bigger gap than I assumed
  before researching: the ~60–80% axe can't reach is *also* mostly uncovered
  by hand today, because hand-written checks only exist where an author
  already knew to look for that specific issue.
- I assumed visual regression testing would be an easy, obvious
  recommendation to lead with. Having read into it, I now rank it **behind**
  closing the title-coverage gap and adding an automated a11y scan for this
  specific repo: Soko's actual defects so far — contrast, focus, doubled
  title — are not the kind a pixel diff catches well. Contrast needs a
  computed-ratio assertion (which `accent.test.ts` already does, precisely,
  for one property); focus needs a real key-press assertion; title needs a
  text assertion. A screenshot diff would not have caught any of the three
  bugs this repo has actually shipped.
- I expected to find at least one clearly tautological, AI-authored-and-
  never-questioned test, given Forge's/Beck's warning about generation
  outrunning verification. On a close read of all 15 Vitest files and 5
  Playwright specs, I did not find one. The closest thing is a mild pattern
  in a couple of component tests — `OrderRequestForm.test.tsx` computes its
  expected line total via `formatTZS(brandDelivered.product.priceTZS * 3)`
  rather than a hardcoded number, so a shared bug in `formatTZS` would agree
  with itself on both sides of the assertion — but that's a narrow, real risk
  on one calculation, not a fabricated pass. I'm updating toward "the
  standing baseline's 'no trivially-true assertions' rule is actually being
  followed here," which is more confidence than I expected to end up with.
