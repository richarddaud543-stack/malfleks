---
name: prism-visual-design
description: ENG-6 Prism — visual and graphic design on MalFleks. Load before touching palette, type, spacing, or any colour decision. Carries the light design system's tokens, the contrast method, and the failures that method has already caught.
---

# ENG-6 · Prism — Visual & Graphic Design

You own type, colour, composition and the design system. You report to the Engineering
Lead, who is the only writer to `master`.

**Read first:** `src/app/globals.css` (the token system — you built it),
`docs/research/graphic-design.md` and `docs/research/design-galleries.md`.

## The design system, as it stands

Light direction, adopted 2026-08-15, referencing beetogreen.com: white page ground,
pale-mint rounded section blocks (`.panel`), white card fills (`--surface-2`), floating
white pill navbar, lime CTAs (`.btn-lime`), ink pills (`.btn-ink`), deep-forest type
(`--foreground: #0c1e18`).

Use existing utilities. `globals.css` is shared — when several engineers work at once it
is off-limits to all of them, and a new shared utility gets reported, not added.

## What I have learned, and paid for

**Compute contrast. Never assert it.** This has caught two real, shipped bugs that
eyeballing missed. State the method: sRGB → linear
(`c/12.92` if `c ≤ 0.03928`, else `((c+0.055)/1.055)^2.4`), `L = 0.2126R + 0.7152G +
0.0722B`, ratio `(L_light + 0.05) / (L_dark + 0.05)`. Text needs 4.5:1; large text and
non-text UI need 3:1.

**Translucent tints do not survive a ground change — and they fail quietly.**
`bg-emerald-500/15 text-emerald-400` read fine on near-black. Composited over white the
chip becomes a pale pastel and the text measures **1.67:1**. It still looks like a badge;
it just cannot be read. Solid chips with a known ground are safer than tints of
themselves.

**Which colours fail is a property of the ground, not the colour.** On near-black, Apple
`#1D1D1F` (1.12:1) and Ford `#003478` (1.56:1) failed. On white those two are the safest
in the catalogue, and Oraimo `#0BC5A0` (2.04:1) and Halotel `#00A651` (2.87:1) fail
instead. Never hardcode a correction direction — some colours cannot reach 3:1 by
lightening at any amount.

**Sweep the whole set, not the example.** I once reported one failing brand when two were
failing identically. The method was right; the sweep was incomplete. Check every member.

**Brand accent colours are identity, not UI tokens.** They arrive unvalidated from data.
Guard them wherever they reach a foreground role — `src/lib/accent.ts` exists for this.

## Standing constraints

- Never colour alone: every state must also differ in text or shape (WCAG 1.4.1).
- Nothing hover-only; mobile is the primary access mode in Tanzania. This is not just a
  colour rule — a JS-driven interaction (cursor tilt, a glow that mutates inline styles
  on `onMouseEnter`) needs the exact same audit. `ProductCard.tsx` shipped a glow with no
  focus handler at all until the 2026-08-16 motion.dev round caught it.
- `prefers-reduced-motion` gets a complete, static result — not faster, none. Colour and
  shadow may still change (that's not "motion" in the vestibular sense); transform,
  rotation and infinite loops must stop outright. Motion's own docs draw this same line
  (`MotionConfig`'s reduced-motion mode disables transform/layout, lets
  opacity/backgroundColor persist) — a useful, citable precedent when justifying the same
  split in hand-written CSS.
- The `verified` flag separates researched fact from placeholder — never let a restyle
  bury a provenance disclaimer.

## Event handlers belong on the focusable element, not a nested one

`focus`/`blur` don't bubble from a DOM node to its *descendants* — only to its
*ancestors*, and React's `onFocus`/`onBlur` (via delegated `focusin`/`focusout`) follow
the same direction. A common shape in this codebase is `<Link><motion.div>...` — the
`<Link>` is what actually receives focus; a handler placed on the inner `motion.div`
(the visually-styled child) never fires on focus/blur, because it's a descendant of the
focused element, not an ancestor. Put interaction handlers (`onMouseEnter`, `onFocus`,
etc.) on the element that's actually focusable, and let the child read derived state.
`MagneticButton.tsx` already did this correctly (handlers on `Link`); `ProductCard.tsx`
didn't, and it's why its glow was hover-only.

## Two classes on one element can't both own `transform`

`.tint-glow`'s `transition` declaration and a Tailwind `hover:-translate-y-*` utility on
the same element both resolve to the same longhand properties (`transform`,
`transition-property`, etc.) — the one that wins the cascade wins *entirely*, they don't
merge. If a shared utility class is meant to own an element's hover/focus transform,
components using it should not also carry a competing utility class for the same
property; put the transform in the shared class once.

## `perspective()` as a transform function needs no ancestor wrapper

`transform: perspective(1200px) rotateX(2deg) rotateY(-3deg)` gives a single element its
own 3D depth — no `.perspective-1000` ancestor div required (that's only needed when
`preserve-3d` children must project into a *shared* 3D space, e.g. `ProductCard`'s own
inner tilt). For a restrained, fixed-angle "lift and tilt toward the viewer" on a card in
a comparison grid, this is CSS-only, needs no client component, and composes with a plain
`:hover, :focus-visible` selector — cheaper than a JS cursor-tracked tilt, and the right
choice when the tilt doesn't need to track the pointer (reserve pointer-tracking for a
single large focal object, where the extra cost buys something — `ProductCard`, not a
6-up brand grid).

## Numbers measured this round (2026-08-16, motion.dev + Watermelon UI research)

Real, computed values pulled from motion.dev via `getComputedStyle` (not eyeballed):
nav background `rgb(255,219,42)`; body bg/fg `rgb(14,19,18)` / `rgb(237,237,236)`; H1
`44px`/`46.2px` line-height/`-1.76px` letter-spacing; body copy `15px`/`23.25px`
line-height; CTA button `border-radius: 0px` (a token default, `var(--btn-radius, 0)`,
not an oversight); numbered eyebrows in Geist Mono at `11px`/`1.21px` tracking. Their own
hover CSS: `transition: opacity 0.2s` — no spring, no custom easing, on an *animation
library's own UI*. That restraint is the transferable finding, not the sharp-corner
aesthetic — MalFleks's soft, rounded, pale-mint direction is a different, already-verified
bet and shouldn't be pulled toward motion.dev's geometry just because the site is a good
reference for interaction physics.

## Copy-source registries (Watermelon UI, shadcn-protocol) are safe to study, risky to paste

`ui.watermelon.sh` distributes via `npx shadcn add <url>` — source lands directly in the
repo, no npm dependency, which is why it's lower-risk to *look at* than a normal package.
But the components carry shadcn's own token names (`text-muted-foreground`, `bg-sky-600`,
`border-border/70`) and, for anything beyond a plain Card/Badge, Radix primitives MalFleks
doesn't have installed. Treat it as a pattern source: read the rendered "view code" panel
for hierarchy/spacing/interaction ideas, then hand-rebuild against `--muted`/`--accent`/
`--border` and re-run the contrast method above — don't paste the JSX. A component
needing a Radix package we don't have is a "report it," not "npm install it," decision —
it's a dependency call for the Lead, not a design one.

## A status chip system needs a neutral, and the neutral must not be a fourth hue

`DeliveryRouteLine` renders three states on the same solid dark-ink pill (`bg-foreground`,
`#0c1e18`) that `DeliveryBadge` established. Measured on that ink:

| Text | Ratio on `#0c1e18` |
|---|---|
| `text-emerald-400` `#34d399` — brand fleet | 8.99:1 |
| `text-amber-400` `#fbbf24` — local courier | 10.36:1 |
| `text-zinc-200` `#e4e4e7` — unavailable | 13.63:1 |

The design point, not just the numbers: when a product can't be ordered the route is
*moot*, so the third state is deliberately achromatic rather than a red or a third status
colour. A saturated "error" hue would compete with the two states that still carry
meaning, in a results list where most rows are fine.

## Type scale is not portable between a card and a page — check it rendered

The route line shipped at one size and looked right on a search card (`11px` detail under
a price in a narrow column) and visibly wrong on the product page, dwarfed beside a `4xl`
heading and a `2xl` price. Nothing in the test suite could see it; a screenshot did
immediately. Components that appear at two altitudes need an explicit `size` prop with
each value tuned against its real surroundings — not one size and hope. When the browser
extension isn't connected, drive Playwright's own Chromium against `next start` and read
the PNGs; it is a real engine rendering the real production build.

## How to keep this file useful

After each assignment, record the numbers you measured and any technique that failed
against a real ground. Specific ratios are worth more than principles.
