# motion.dev and Watermelon UI — design research

Prepared by ENG-6 (Prism), Visual & Graphic Design. Assignment: study
[motion.dev](https://motion.dev) — the site for the `motion` library Soko
already depends on — and apply what genuinely fits a comparison-shopping
marketplace. Scope was extended mid-round to also evaluate
[Watermelon UI](https://ui.watermelon.sh/), a copy-source component
registry, for selective adoption. Both are covered here since both fed the
same set of decisions on the cards, badges, pills and panels this seat owns.

Both sites were inspected directly — screenshots, `getComputedStyle()`
readings and real component source pulled live via a browser tool, not
guessed from memory — with the concrete values quoted below. Docs pages were
fetched with `WebFetch`; live rendering, computed styles and interaction
states came from driving an actual browser (Chrome via `claude-in-chrome` for
the first half of this session, then a second Playwright-based browser tool
after the first one dropped its connection — noted where it matters).

## 1. motion.dev — what it actually does

### 1.1 Restraint, measured, not just claimed

The single most transferable finding: **motion.dev's own UI barely uses
motion.** Reading the site's live stylesheet (`document.styleSheets`,
filtered for `transition`/`cubic-bezier` rules) found:

```css
.btn { transition: opacity 0.2s; }
.modal-close { transition: color 0.15s; }
```

Plain CSS, no spring, no custom easing curve — a 150–200ms linear-ease fade
is what an animation library reaches for on its own hover/close affordances.
The homepage's big, showy animated demos (the numbered 01–08 feature grid,
described below) are the *marketing* surface; the actual UI chrome — nav
links, the primary CTA — is close to motion-free. This directly informs the
restraint principle applied throughout this round: hover/focus feedback on
Soko's cards stayed duration-based CSS tweens (`.tint-glow`, `globals.css`);
springs were reserved for things that react to continuous input (the product
card's cursor tilt) or a genuine one-shot arrival (the product showcase's
mount), never for a binary on/off state change.

### 1.2 Real computed values (`getComputedStyle`, not eyeballed)

Pulled live from `https://motion.dev/` and `https://motion.dev/ui`:

| Element | Property | Value |
|---|---|---|
| `<body>` | `font-family` | `"TASA Orbiter", sans-serif` |
| `<body>` | `background` / `color` | `rgb(14,19,18)` (#0e1312) / `rgb(237,237,236)` (#ededec) |
| `<h1>` | `font-size` / `line-height` / `letter-spacing` / `font-weight` | `44px` / `46.2px` (≈1.05 ratio) / `-1.76px` (≈-4%) / `700` |
| `<p>` (body copy) | `font-size` / `line-height` / `color` | `15px` / `23.25px` (≈1.55 ratio) / `oklch(0.69 0.012 148)` (muted, low-chroma green-gray) |
| Nav (`<header>`) | `background` / `position` / `border-radius` / `box-shadow` | `rgb(255,219,42)` (#ffdb2a) / flat, not floating / `0px` / `none` |
| "MOTION+" CTA | `border-radius` / `padding` / `font-size` / `font-weight` / `letter-spacing` / `text-transform` | `0px` / `12px 18px` / `11px` / `400` / `1.32px` / `uppercase` |
| "01" section eyebrow | `font-family` / `font-size` / `letter-spacing` / `color` | `"Geist Mono", ui-monospace, ...` / `11px` / `1.21px` / `oklch(0.88 0.18 96)` (the yellow) |
| Feature-grid card | `border-radius` | `0px` |
| Source CSS (`.btn`) | — | `border-radius: var(--btn-radius, 0);` — square is the *token default*, not an accident |

Two things worth naming explicitly:

- **A monospace face is reserved for numbers and meta-labels only** (Geist
  Mono for "01"–"08", section counters), while the display/body voice is a
  single geometric sans (TASA Orbiter). This is a legitimate, cheap way to
  signal "this is a spec, not prose" without adding a whole second typeface
  family to the page's reading voice.
- **The CTA button's emphasis comes from size + tracking + uppercase, not
  weight** — `font-weight: 400` on an 11px uppercase label with `1.32px`
  letter-spacing reads as confident without being bold. Soko's own
  `.btn-pill` already does something similar (`font-weight: 600`, but at a
  larger, non-uppercase size) — a different but equally legitimate route to
  the same "confident, not shouty" target.

### 1.3 Structure: the numbered feature grid

The homepage's centrepiece is eight sections ("01 Independent transforms"
through "08 Motion values"), each a small live demo paired with a heading, a
one-line description, and a code fragment (`{rotate:15,x:"50%"}`,
`stagger(0.04)`, `useTransform(() => x.get() * 10)`). Visually: a 4-column
grid where **exactly one card per row of four gets the full yellow fill**
(the "current" example), the rest stay on the near-black ground — one accent
draws the eye without needing more than two colours anywhere on the page.
One card (`03 Native gestures`) is a dashed-border box literally captioned
`● hover / ● press / ● drag` — a legend explaining the three gesture states
the library exposes, doubling as restrained decoration. That triad (hover /
press / drag) is the same one this round applied to Soko's own cards as
hover / focus / tap.

### 1.4 Focus state

Tabbing through the nav (`key: "Tab"` twice, then `zoom` on the header)
showed a **hard-edged black rectangle outline, offset a few pixels, square
corners** around the focused link — visible, unambiguous, and drawn in the
same "engineering annotation" visual language as the dashed demo boxes
elsewhere on the page. Not subtle, and correctly so.

### 1.5 Gesture and transition API defaults (from the docs)

Fetched `motion.dev/docs/react-transitions`, `/docs/react-gestures`,
`/docs/easing-functions`, `/docs/react-motion-config`,
`/docs/react-use-reduced-motion`:

- Tween default duration: **0.3s** (0.8s if multiple keyframes).
- Spring defaults: `bounce: 0.25`, `damping: 10`, `mass: 1`, `stiffness: 1`,
  `restSpeed: 0.1`, `restDelta: 0.01`.
- Named easings: `easeIn`/`easeOut`/`easeInOut`, `backIn`/`backOut`/
  `backInOut`, `circIn`/`circOut`/`circInOut`, `anticipate`, `linear`,
  `steps()`, `cubicBezier()`. No stated guidance on which to use for which
  kind of UI motion — the site's own restraint (§1.1) is the more useful
  signal than the API surface itself.
- Doc example values: `whileHover={{ scale: 1.1 }}`, `whileTap={{ scale: 0.9,
  rotate: 3 }}`, `whileFocus={{ scale: 1.2 }}` — three **separate** props,
  each opted into independently.
- `MotionConfig`'s `reducedMotion` prop: `"user"` (respect the OS setting),
  `"always"` (force reduced, for debugging), `"never"`. **Default is
  `"never"`.**
- `useReducedMotion()`: a hook returning the live boolean, reactive to
  setting changes.

### 1.6 What would be wrong for Soko, and why

- **The zero-radius, hard-edged aesthetic itself.** It's a deliberate,
  consistent identity (`border-radius: var(--btn-radius, 0)` as a literal
  token default) and it's excellent *for a developer tool*. Soko's whole
  direction — pale-mint panels, `1.75rem`+ radii, soft `.glass-card`
  elevation — is the opposite bet, referencing beetogreen's warmth rather
  than an engineering spec sheet. Copying the sharp-corner language wholesale
  would fight the brand that's already been built and verified. What
  *carried over* is the underlying discipline (restraint, one accent per
  moment, a monospace reserved for meta-content), not the geometry.
- **`MotionConfig`'s `reducedMotion` default is `"never"`.** If Soko ever
  wraps a subtree in `MotionConfig`, the default does *not* protect a user
  with the OS setting on — it must be set explicitly to `"user"`. Soko
  currently avoids this trap structurally: every motion component in this
  codebase calls `useReducedMotion()` itself and branches explicitly
  (`ProductShowcase.tsx`, `ScrollReveal.tsx`, `ScrollStagger.tsx`, and now
  `ProductCard.tsx`), rather than relying on a `MotionConfig` default. Worth
  stating for whoever reaches for `MotionConfig` next: don't assume the
  default is safe.
- **The docs' own gesture examples are hover-first.** `whileHover` and
  `whileFocus` are demonstrated as separate, independently-added props, in
  separate examples — never together in one snippet. Copying "the hover
  pattern" from the docs without deliberately also adding the focus (and, for
  touch, tap) equivalent reproduces exactly the hover-only anti-pattern this
  project's standing constraints forbid. This is not a flaw in Motion's docs
  (a docs page demonstrating one prop at a time is reasonable) — it's a
  trap for whoever skims rather than reads, and it is exactly what
  `ProductCard.tsx`'s pre-existing glow (`onMouseEnter`/`onMouseLeave`
  mutating inline styles directly, no focus handler at all) had already
  fallen into before this round.

Sources: [motion.dev](https://motion.dev/) ·
[motion.dev/ui](https://motion.dev/ui) ·
[React transitions](https://motion.dev/docs/react-transitions) ·
[React gestures](https://motion.dev/docs/react-gestures) ·
[Easing functions](https://motion.dev/docs/easing-functions) ·
[MotionConfig](https://motion.dev/docs/react-motion-config) ·
[useReducedMotion](https://motion.dev/docs/react-use-reduced-motion)

## 2. Watermelon UI — evaluated, adopted selectively

[ui.watermelon.sh](https://ui.watermelon.sh/) is an open-source registry of
750+ components (its own homepage states "600+" in the hero copy and "750+"
per the assignment brief — component count is evidently still growing) built
on **Tailwind + Radix**, distributed shadcn-style: `npx shadcn add
"https://registry.watermelon.sh/<component>.json"` copies source into the
project rather than installing a package. Its own pitch: *"Tweak CSS
variables just like you'd adjust Tailwind classes. Add your own tokens, and
every component instantly inherits your brand's unique DNA"* — i.e. it's
built to be re-tokenised, not just skinned.

### 2.1 What was actually inspected

Real component source, pulled from the live "view code" panel on
`/components/card` (Card 12, an e-commerce product card — the closest
analogue to Soko's `ProductCard`):

```tsx
<div className="relative max-w-md overflow-hidden rounded-2xl shadow-lg">
  <div className="relative h-72">
    <img src={product.imageSrc} alt={product.imageAlt} className="size-full object-cover" />
    <div className="absolute inset-0 bg-linear-to-t from-black/10 via-transparent to-transparent" />
  </div>
  <Button size="icon" onClick={() => setLiked((c) => !c)}
    className="absolute top-4 right-4 rounded-full border border-white/60 bg-white/85 ... backdrop-blur-sm">
    <HeartIcon className={cn('size-4', liked ? 'fill-destructive stroke-destructive' : 'stroke-current')} />
  </Button>
  <Card className="rounded-t-none border-none shadow-none">
    <CardHeader className="space-y-2">
      <CardTitle>{product.title}</CardTitle>
      <CardDescription className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-border/70 bg-background/70 rounded-sm">{product.sizeLabel}</Badge>
        <Badge variant="outline" className="border-border/70 bg-background/70 rounded-sm">{product.colorLabel}</Badge>
      </CardDescription>
    </CardHeader>
    <CardContent><p className="text-muted-foreground leading-6">{product.description}</p></CardContent>
    <CardFooter className="justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
      <div className="flex flex-col">
        <span className="text-muted-foreground text-sm font-medium uppercase">Price</span>
        <span className="text-2xl font-semibold">{product.price}</span>
      </div>
      <Button size="lg" className="bg-sky-600 ...">Add to cart</Button>
    </CardFooter>
  </Card>
</div>
```

Also inspected: `/components/badge` (an `outline` variant using `rounded-sm`
— *less* rounded than a full pill — for descriptive attribute tags), and
`/animated-components/category/cards` (15 dashboard-style "hero" cards —
Budget Card, Credit Usage Card, Expandable Event Card — each a single showy
widget, not a repeatable grid item).

### 2.2 Transferable patterns (re-tokenised, not copied)

- **Eyebrow-label-above-value hierarchy for price.** `Price` (small, muted,
  uppercase) stacked above the large bold amount, with the CTA beside it,
  collapsing to a stacked full-width layout on mobile
  (`max-sm:flex-col max-sm:items-stretch`). This is the pattern this round
  used for the delivery-mix and status language already on `BrandCard`/
  `DeliveryBadge` — confirmation that the existing "small muted label, larger
  bold value" hierarchy is the right one, not a prompt to change it.
- **A shape distinction between status badges and attribute chips.**
  Watermelon's outline badge for descriptive facts (size, colour) uses
  `rounded-sm` — visibly less round than a state pill. Soko's own
  `DeliveryBadge` is a full `rounded-full` pill, and it is a *state*
  (delivers directly vs. doesn't), not a descriptive attribute — so the
  existing shape is the semantically correct one per this same convention,
  not a defect. No change made to `DeliveryBadge.tsx`; recorded here as
  validation rather than silently skipped.
- **Floating circular affordance over an image, translucent + blurred.** The
  `bg-white/85 backdrop-blur-sm` heart-toggle button is a clean pattern for
  "an action that sits on top of imagery without a hard edge." Soko's own
  card imagery is flat SVG icon tiles rather than photography, so this
  specific pattern had no direct application this round — noted for Atlas if
  a future surface (e.g. a product photo gallery) needs it.

### 2.3 What was rejected, and why

- **The Radix-backed complex primitives** (Dialog, Popover, Select, Sheet,
  Tooltip, Dropdown Menu — all present in the registry's sidebar). None of
  Soko's card/badge/pill work needed them: Card and Badge are Watermelon's
  own plain presentational components with no Radix dependency. `grep`-ing
  `package.json` confirmed Soko has **no Radix packages installed today**
  (`@gsap/react`, `gsap`, `lenis`, `motion` are the only animation-adjacent
  dependencies). Installing Radix to adopt a component this round didn't
  need would be exactly the "report rather than install" case named in the
  brief — nothing here required it, so nothing was installed.
- **The shadcn `Card`/`Badge`/`Button` composition wholesale.** Its own
  token names (`text-muted-foreground`, `bg-sky-600`, `border-border/70`)
  are shadcn's defaults, not Soko's (`--muted`, `--accent`, `--border`).
  Pasting the JSX in raw would silently reintroduce exactly the untokenised,
  unverified-contrast risk this seat exists to prevent — `bg-sky-600` on the
  "Add to cart" button, for instance, has never been measured against any of
  Soko's grounds. The *visual grammar* (hierarchy, spacing, the price/CTA
  split) was extracted and hand-rebuilt against Soko's own tokens instead;
  no Watermelon source was pasted into this codebase.
- **The animated-components "expandable card" widgets.** Dashboard-style,
  single-hero-card interactions (a card that grows, reveals a chart, morphs
  into a detail view). Soko already has the equivalent finding on file from
  the prior design-galleries research (`docs/research/design-galleries.md`)
  against Codrops' clip-path grid effect: a comparison grid where a shopper
  is scanning many rows for the cheapest price/fastest delivery needs every
  row to look the same as the first, not to individually balloon into a
  showcase state. Same reasoning, same rejection, independently reached
  against a second source.

Sources: [Watermelon UI](https://ui.watermelon.sh/) ·
[Card component](https://ui.watermelon.sh/components/card) ·
[Badge component](https://ui.watermelon.sh/components/badge) ·
[Animated cards](https://ui.watermelon.sh/animated-components/category/cards) ·
[GitHub — watermelon-platform](https://github.com/WatermelonCorp/watermelon-platform)

## 3. Applied to Soko this round

All changes are CSS/Motion using existing tokens — no new dependency, no
Watermelon source pasted in.

- **`globals.css`** — `.tint-glow` now drives hover *and* `:focus-visible`
  identically (lift + a small fixed-angle 3D tilt via a self-contained
  `perspective()` transform, replacing the Tailwind `hover:-translate-y-*`
  utilities that used to fight it for the `transform` property), with a
  `prefers-reduced-motion` carve-out that removes the transform but keeps
  colour/shadow feedback — mirroring Motion's own "transform and layout
  disabled, opacity/backgroundColor persist" reduced-motion model (§1.5).
  Same focus-visible + reduced-motion treatment added to `.btn-pill`/
  `.btn-lime`/`.btn-ink`. `.blob`'s infinite 18s drift and Tailwind's
  `animate-pulse` (used by every skeleton loader, including the root
  `loading.tsx` this round doesn't own) now stop under reduced motion —
  both were previously unguarded.
- **`BrandCard.tsx` / `BranchCard.tsx`** — updated to the single-source
  `.tint-glow` treatment above; `hover:border-foreground/20` gained a
  `focus-visible:` twin.
- **`BrandCatalog.tsx`** — the active category pill's background now slides
  between buttons via Motion's `layoutId` shared-layout animation (§1.3's
  "04 Layout animation" capability), reduced-motion-safe (`duration: 0`).
  Also fixed a real, shipped bug found while in the file: `hover:border-white/30`
  is a dark-theme leftover, invisible on the current light ground.
- **`ProductCard.tsx`** — the accent-tinted glow was hover-only before this
  round (`onMouseEnter`/`onMouseLeave` mutating inline styles directly, no
  focus handler existed at all — the exact trap named in §1.6). Refactored
  to state driven by hover *and* focus *and* touch/press (`whileTap`), moved
  onto the actually-focusable `<Link>` rather than the nested `motion.div`
  (event handlers on a descendant of the focused element don't fire on
  focus/blur — confirmed by testing, not assumed). The cursor tilt's raw
  pointer position is now eased through `useSpring` (the same
  `{stiffness:300, damping:20, mass:0.4}` config `MagneticButton.tsx`
  already uses, reused rather than reinvented) before driving rotation,
  per §1.1/§1.5's spring-for-continuous-input finding. The tilt is fully
  inert under reduced motion (pointer handler no-ops rather than just
  skipping the animation).
- **`ProductShowcase.tsx`** — a one-shot spring "materialize" on mount
  (opacity + scale), skipped outright under reduced motion. Still the single
  stable root the surrounding `<ViewTransition>` requires.
- **`src/app/brands/loading.tsx`** (new) — replaces the generic root
  skeleton for this route with one shaped like the real `BrandCard`/
  `BrandCatalog` anatomy (logo tile, heading, category, delivery-mix pill,
  description, filter row), so the loading state previews what's arriving.

## 4. Recommendation for Atlas (not touched — outside this round's files)

`ListingCard.tsx` (`src/components/search/`) uses the same `.tint-glow`
class this round improved — it now gets `:focus-visible` parity and the
reduced-motion carve-out for free, with no edit to that file. Worth Atlas
knowing so nothing there looks unexplained in a diff review, and worth
checking whether `ListingCard`'s own glow ever wants the same fixed-tilt
treatment (`ProductCard`'s cousin on `/search`) — left as a suggestion, not
applied, since that file is Atlas's.

## Where this research was incomplete

- The claude-in-chrome browser connection dropped mid-session (after
  several successful navigations and `getComputedStyle` reads on motion.dev)
  and did not reconnect; the Watermelon UI half of this research used a
  second, Playwright-based browser tool instead. Noted plainly rather than
  claiming one continuous session.
- Motion.dev's `/docs/react-accessibility` page (accessibility guidance
  beyond `useReducedMotion` specifically) was not fetched directly — the
  reduced-motion mechanics came from `/docs/react-motion-config` and
  `/docs/react-use-reduced-motion`, and a broader accessibility guide may
  have more to say that isn't reflected here.
- Watermelon UI's raw component registry JSON (the actual shadcn-protocol
  source files, as opposed to the rendered "view code" panel) was not
  reachable at the URL patterns tried (`/r/<name>.json` etc. all resolved to
  the SPA shell) — what's quoted in §2.1 is the code panel's rendered
  output, which matches what a real `shadcn add` would paste in, but wasn't
  independently cross-checked against the registry endpoint itself.
