# Graphic design research and visual-system audit

Prepared by ENG-6 (Prism), Visual & Graphic Design. Research budget: 5 web searches + 4 fetch attempts (2 fetches failed and are marked unfetchable below). No video content was watched — see note under "Who to learn from."

## 1. Who to learn from

**I did not watch any video.** Everything below is drawn from secondary text material (search result summaries and articles), not from viewing footage, so treat channel recommendations as reputational pointers, not endorsements of specific content I've verified.

- **Refactoring UI (Adam Wathan & Steve Schoger)** — a book/site, not a channel, but the single most relevant resource for this codebase specifically: it's written for developers styling their own UI with a utility-first CSS framework, which is exactly MalFleks's situation (Tailwind v4, no design tool in the loop).
- **DesignCourse** (Gary Simon) — foundations: color theory, typography, layout, design psychology; broad and practical.
- **The Futur / Chris Do** — branding and design-thinking, useful for the "why" behind identity decisions rather than pixel-level execution.
- **Will Paterson** and **Satori Graphics** — logo and brand-identity focused; secondary relevance to MalFleks given the per-brand accent-color system, but oriented toward mark-making, not web layout.

None of these were watched or read in full for this report; they're named because multiple independent secondary sources converge on them as credible.

## 2. What current practice says (2025-2026)

**Type scale and hierarchy.** Pick a base body size, then step headings by a consistent ratio (commonly 1.2–1.25) so every level feels related rather than arbitrary. 2025 guidance increasingly pushes fluid type via CSS `clamp()` so headings scale continuously with viewport instead of jumping at breakpoints. Line length target: 45–75 characters; body text contrast target: at least 4.5:1. (design.dev's typography guide covers the pairing and hierarchy point directly, but the fetch to `design.dev` timed out — noted as unfetchable, claim sourced from the search-result summary only.)
Source: [Optimal Typography For Web Design In 2025](https://www.elegantthemes.com/blog/design/optimal-typography-for-web-design), [Mastering typography in design systems with semantic tokens](https://uxdesign.cc/mastering-typography-in-design-systems-with-semantic-tokens-and-responsive-scaling-6ccd598d9f21)

**Color systems for dark UI.** Avoid pure black backgrounds — deep grays/navies (e.g. `#121212`–`#181A1B`) read as more premium and less harsh than `#000`. Accent colors need *more* saturation on dark backgrounds to hold up, but a common recommendation is to desaturate raw brand colors 20–30% when they're reused as UI accents rather than dropping brand hex values in unmodified — full-saturation brand color against near-black can produce glare or, at low luminance, disappear entirely (see the Apple finding below).
Source: [Dark Mode Color Palettes for Modern Websites](https://colorhero.io/blog/dark-mode-color-palettes-2025), [Designing for Dark Mode: UI Tips and Tools](https://www.wildnetedge.com/blogs/dark-mode-ui-essential-tips-for-color-palettes-and-accessibility)

**Contrast requirements — two different rules, often conflated.** WCAG 1.4.3 (text): 4.5:1 for normal text, 3:1 for large text (AA); 7:1 / 4.5:1 at AAA. WCAG 1.4.11 (non-text): icons that convey information, buttons, borders, focus indicators need only 3:1 against their adjacent color — a materially lower bar, but one that still gets missed constantly. NN/g is cited as finding users fail to recognize low-contrast interactive elements roughly 40% more often.
Source: [WCAG Contrast (Minimum) Explained](https://www.getstark.co/wcag-explained/perceivable/distinguishable/contrast-minimum/), [1.4.11 Non-Text Contrast — Deque University summary via search](https://dequeuniversity.com/resources/wcag2.1/1.4.11-non-text-contrast) *(direct fetch to dequeuniversity.com timed out — cited from search snippet only, not independently verified)*

**Spacing.** The dominant convention is an 8px base grid with a 4px sub-grid for tight, inner-component spacing (icon padding, badge gaps). 4px/2px values are meant to be the exception, not the default rhythm.
Source: [Designing with Spacing: The Power of a 4-Point System](https://medium.com/@linz07m/designing-with-spacing-the-power-of-a-4-point-system-949771d8dbf4), [Basics: Spacing systems & scales in UI design](https://blog.designary.com/p/spacing-systems-and-scales-ui-design)

## 3. Audit of MalFleks's visual system

Grounded in `src/app/globals.css` and `src/app/layout.tsx`, plus `src/data/brands.ts`, `src/components/brand/BrandCard.tsx`, `src/components/search/ListingCard.tsx`, and `src/components/product/ProductCard.tsx`.

### Tokens (globals.css:3-13)
```
--background: #06070a   --surface: #0e1016   --surface-2: #161923
--foreground: #f2f3f5   --muted: #9ca0ad     --border: #23262f
--accent: #7c9eff       --accent-2: #c65bff  --accent-3: #ff8a5c
```
Fonts (layout.tsx:9-29): Geist Sans/Mono (unused for the branded look — the display system is Bricolage Grotesque for headings via `font-display`, Instrument Serif italic for the accent word via `font-accent-serif`, per `@theme inline` block in globals.css:15-29).

### Contrast — computed, method shown

I computed WCAG relative luminance and contrast ratio by hand for the token pairs that matter, using the standard formula: sRGB channel → linear (`c/12.92` if `c ≤ 0.03928` else `((c+0.055)/1.055)^2.4`), `L = 0.2126R + 0.7152G + 0.0722B`, ratio = `(L_light + 0.05) / (L_dark + 0.05)`.

| Pair | Values | Ratio | Verdict |
|---|---|---|---|
| `--foreground` on `--background` | `#f2f3f5` / `#06070a` | **18.15:1** | Passes AAA with huge margin — arguably higher than needed; not a defect, just headroom. |
| `--muted` on `--background` | `#9ca0ad` / `#06070a` | **7.72:1** | Passes AAA (7:1) even for body-size text. Muted text is not actually low-risk here. |
| `--accent` on `--background` | `#7c9eff` / `#06070a` | **7.86:1** | Passes AAA. Safe as a link/label color. |
| Apple's brand icon vs. its own tinted chip | icon `color: #1D1D1F` on chip `background: #1D1D1F` at ~9.4% opacity over `--surface` (`#0e1016`) → composited chip ≈ `rgb(15,17,23)` | **≈1.12:1** | **Fails badly**, even against the lower 3:1 non-text bar. The icon is nearly invisible. |

That last row is a real, reproducible bug, not a hypothetical: `ListingCard.tsx:32-37` and `ProductCard.tsx` (via `ProductGrid.tsx`) both do `background: ${accentColor}18` for the icon chip and `color: accentColor` for the icon itself, driven straight from `brand.accentColor` in `src/data/brands.ts`. Every brand's raw hex is used unmodified as both an icon color and a low-opacity tint of the *same* color as its background. For Toyota red, BMW blue, Oraimo teal, Halotel green — all mid-to-high luminance colors — this still produces enough contrast to read. For **Apple, `accentColor: "#1D1D1F"`** (`src/data/brands.ts:54`) — a near-black brand color chosen correctly for print/logo use — this pattern produces an icon that's almost the same color as its own background chip. This is the single highest-priority visual bug in the system, and it's structural: it will recur for any brand whose accent happens to be dark (a real risk with six more brands likely to be added later, per the roadmap in delivery-state notes).

I did not compute contrast for `--accent-2` (`#c65bff`) or `--accent-3` (`#ff8a5c`) against `--background`, or for any brand accent color used as *body text* (only checked the one icon-chip case above) — flagging this as unverified rather than asserting a number.

### Type pairing and scale

Bricolage Grotesque (geometric-leaning grotesque, good weight range) as the display face paired with Instrument Serif italic as a single-word accent (`text-gradient`/`italic` treatment, e.g. `page.tsx:32-34`, "One" in the hero) is a legitimate, current pairing pattern — a heavy grotesque doing the structural work with a high-contrast serif italic doing the "voice" moment on one word. This is the kind of pairing 2025 sources describe as effective: one workhorse, one accent, not two competing voices.

The scale itself is Tailwind's default stepped scale (`text-5xl` → `sm:text-6xl` → `lg:text-7xl` for the H1, `text-3xl`/`sm:text-4xl` for H2, `text-lg` for card titles, `text-sm`/`text-xs` for body and labels — confirmed across `page.tsx`, `BrandCard.tsx`). There is exactly one `clamp()` usage in the whole `src` tree (`TanzaniaMap.tsx`, and it's a positioning clamp, not typographic) — meaning the "fluid type via clamp()" pattern current guidance recommends isn't in use anywhere. That's not automatically wrong — breakpoint-stepped headings are a defensible, simpler alternative — but it does mean the H1 jumps in three discrete steps (48px → 60px → 72px going by Tailwind's defaults) rather than scaling continuously, so there's likely a size right at each breakpoint edge where it looks slightly under- or over-sized relative to the viewport it just left.

### Spacing rhythm

Sampled values across `page.tsx` and `BrandCard.tsx`: `p-3` (12px), `p-4`/`gap-4` (16px), `px-5` (20px), `p-6` (24px), `gap-10` (40px), `py-16`/`py-20` (64px/80px), radii `rounded-xl`/`rounded-2xl`/`rounded-full`. This is a clean 4px-base, 8px-preferred rhythm — it matches current best practice directly and there's no evidence of odd one-off pixel values fighting the grid. This part of the system is genuinely working and needs no intervention.

### Per-brand accent treatment

The `--tint` CSS custom property pattern (`BrandCard.tsx:10`, `ListingCard.tsx:28`, `LocatorBranchCard.tsx:19`, `OrderSummary.tsx:37`) is a well-built mechanism: each card sets `--tint` inline from `brand.accentColor`, and `.tint-glow:hover` (globals.css:83-88) consumes it generically. That's good CSS architecture — one hover rule serves six brands with zero per-brand branching in the component logic. The problem isn't the mechanism, it's that raw, unmodified brand hex is fed into it and into *foreground* roles (icon fill, text color, border color) with no luminance check or fallback. The mechanism is sound; the inputs aren't guarded.

### What's decoration doing no work

- `.bg-grid` (globals.css:90-96) — a masked grid background behind the hero. Reads as generic "premium SaaS hero" texture; it doesn't reinforce the brand-routing product story and would look identical on almost any dark marketing site. Not harmful, just replaceable.
- Three animated blobs per major section (`page.tsx:14-16`, `88`) at different opacities/delays — the pattern is fine once, but repeated on every section it becomes wallpaper rather than a wayfinding signal. Consider reserving the blob treatment for section *transitions* only, not every section body.

## 4. Where I was wrong

- I expected the type scale to use fluid `clamp()` sizing given the project's stated "premium, award-site" ambition — it doesn't; it's a standard Tailwind breakpoint scale. Not a defect, just not what I assumed going in.
- I assumed `--muted` (`#9ca0ad`) would be the token most likely to have a marginal contrast ratio, since muted/secondary text is the classic place accessibility breaks down. It's actually comfortably AAA (7.72:1) — the real failure was somewhere I hadn't thought to check until I traced how `accentColor` gets reused as a foreground color for icons, not in the core neutral palette at all.
- I initially expected the per-brand accent system to be the weak point structurally (inline styles vs. tokens). The architecture (`--tint` custom property + one generic hover rule) is actually well designed; the defect is a data/contrast problem, not an architecture problem.

## What I could not verify

- `dequeuniversity.com` and `design.dev` fetches both timed out (`getaddrinfo ETIMEOUT`) — cited only from search-result snippets, not confirmed against the primary page text.
- Contrast ratios for `--accent-2` (`#c65bff`) and `--accent-3` (`#ff8a5c`) against `--background` — not computed.
- Contrast for brand accent colors used as *text* elsewhere in the app beyond the one `ListingCard`/`ProductCard` icon-chip case traced above (e.g., `CityLocator.tsx:106-107`, `TanzaniaMap.tsx` map markers) — not computed; flagged as the same class of risk but unverified.
- No video content watched for the "who to learn from" section — those are reputational pointers from secondary text sources, not personally verified recommendations.
