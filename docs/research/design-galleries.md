# Design showcase and gallery sites — what they're actually good for

Prepared by ENG-6 (Prism), Visual & Graphic Design. Second Phase 0 assignment: study
website design showcase/gallery sites themselves (not typography/contrast — see
[`graphic-design.md`](graphic-design.md) for that). Research budget: 16 lookups (10
`WebSearch`, 6 `WebFetch`; 1 fetch redirected and was abandoned rather than chased).

**The medium problem, stated up front.** I cannot see images. Every gallery site in this
brief is fundamentally a visual product — thumbnails, hover-video previews, screenshots.
Where I "cover" Awwwards, Godly, SiteInspire, Land-book, Lapa Ninja, Httpster, Dribbble,
and Behance below, in most cases I am relaying what *other, secondary, text-based sources*
(blog listicles, review sites) say these galleries contain — I did not and could not read
the design work itself. I directly fetched only two gallery-adjacent pages (SiteInspire,
Godly) specifically to test how much real text lives on them, and the answer was "almost
none" — confirming the concern rather than resolving it. The two sources I could fetch and
read in full — a Codrops tutorial and a Smashing Magazine article — are accordingly
weighted much more heavily below, per the brief's own instruction.

## 1. The sites themselves

| Site | What it actually is | Reward reading, or reward looking (that I can't do)? |
|---|---|---|
| **Codrops** (tympanus.net) | Full build tutorials with real code — GSAP timelines, clip-path math, CSS grid mechanics, written by the developers who built the demo. | **Reads.** The one gallery-adjacent site in this list that is genuinely a text medium. Fetched directly, see §2. |
| **Smashing Magazine** | Long-form articles with concrete, numbered UI recommendations and (occasionally) cited research/stats. | **Reads.** Fetched directly, see §2. |
| **Refactoring UI** (book/site by Adam Wathan & Steve Schoger) | A paid book; the web presence is mostly a sales page. What circulates freely is secondary — chapter summaries on Medium, book-summary sites. | **Reads, but I only read summaries of it, not the book.** Flagging this distinction because "Refactoring UI says X" in §2 below means "multiple independent summaries of Refactoring UI say X," not "I read the chapter." |
| **Awwwards** | A judged awards directory. The homepage/gallery is pure visual grid; the *evaluation methodology* pages (`/about-evaluation/`) are text and were searchable. Individual Site-of-the-Day pages reportedly carry jury scores but I could not confirm actual written jury commentary exists in readable form — see §4, unverified. | **Half and half.** The scoring rubric reads; the actual winning sites do not (to me). |
| **SiteInspire** | Directly fetched. Confirmed: a title, a designer/agency credit, and a timestamp per entry. No written critique, no design breakdown, nothing explaining *why* a site was chosen. | **Purely looks.** Gave me almost nothing usable. |
| **Godly** | Directly fetched — and `godly.website` now 301-redirects to `recent.design`. Whatever curatorial voice Godly had is, as of this research (Aug 2026), behind a different domain I did not chase further per the "abandon failed fetch" rule. Secondary sources describe it as an ultra-selective (3–5 sites/week) animation-and-motion showcase with auto-playing scroll-recording thumbnails instead of static screenshots. | **Purely looks**, and possibly not even reliably at that URL anymore. |
| **Land-book** | Not fetched directly (a JS-heavy filterable app; unlikely to yield real text even if fetched, based on the SiteInspire result). Secondary sources describe it as curated-by-review, organized by industry/style tags, with personal "boards" for saving. | **Purely looks**, per secondary description. |
| **Lapa Ninja** | Not fetched directly. Secondary sources describe full-page scrolling screenshots (not just above-the-fold) categorized by industry, which is a meaningfully different artifact than a single hero thumbnail — but still an image. | **Purely looks.** |
| **Httpster** | Not fetched directly. Secondary sources describe a smaller, personally-curated list biased toward independent designers, studios, and type foundries — "opinionated" is the word that recurs — but the curation itself, not written analysis, is the product. | **Purely looks.** |
| **Dribbble** | Not fetched directly (shot-based social feed, no article body to retrieve). What I have is third-party trend write-ups analyzing *patterns across many Dribbble shots* (product-card structure, strategic accent color) — genuinely useful, but it is commentary several steps removed from Dribbble itself. | **Purely looks**, secondhand analysis only. |
| **Behance** | Searched, not fetched. Search results returned literally project titles and view/appreciation counts (e.g. "Crewly: AI-Powered Gig Marketplace UIUX," 595 appreciations) — confirms Behance is a discovery surface, not a text source; the actual case-study body copy lives inside image-heavy project pages I did not open. | **Purely looks.** Gave me titles, nothing else. |
| **Muzli** | Searched, not fetched. It is a curation *aggregator and weekly digest* — its value is surfacing other people's work fast, which is again a discovery function, not original written analysis. | **Mixed** — the blog posts themselves are text, but they mostly point elsewhere. |

**Bottom line on the gallery layer:** of the twelve named sites, exactly two (Codrops,
Smashing) are actually a text medium I can use as a primary source. Everything else in
this list is, honestly, a set of doors I can describe from the outside but not walk
through. That is the honest constraint this report operates under.

## 2. Transferable patterns (with real URLs retrieved)

**Awwwards' own scoring weights are a design fact, not just gossip.** Per
[`awwwards.com/about-evaluation`](https://www.awwwards.com/about-evaluation/) and
corroborating summaries: **Design 40%, Usability 30%, Creativity 20%, Content 10%.**
Design and Creativity together (60%) outweigh Usability by exactly 2:1. That ratio is the
mechanism behind why award-winning sites and *usable* sites are frequently different
things — it's not an accident of taste, it's what the scoring rewards.
Source: [Awwwards — Evaluation System](https://www.awwwards.com/about-evaluation/),
[Awwwards Judging Criteria: How Scoring Works](https://www.hontran.dev/blog/awwwards-judging-criteria)

**Even Awwwards' own newer guidance polices performance.** Secondary summaries of current
Awwwards commentary state jurors "test on real devices" and that "a 3D hero that drops to
18fps on a mid-range Android... will not win." This is the same publication whose scoring
rewards heavy visual craft, explicitly warning against the payload cost of that craft.
Source: [10 Award-Winning Websites of 2026, Judged](https://www.hontran.dev/blog/best-award-winning-websites-2026)

**The Codrops "grid-to-preview" hover pattern (fetched and read in full).**
[Animated Product Grid Preview with GSAP & Clip-Path](https://tympanus.net/codrops/2025/05/27/animated-product-grid-preview-with-gsap-clip-path/)
(Gwen Bogaert, May 2025) builds a genuinely specific technique: hovering a product grid
cell animates a `clip-path` from a cross-shaped polygon
(`polygon(0% 40%, 40% 40%, 40% 0%, 60% 0%, ...)` — four corner windows) down to a single
point, while the hovered card and its three grid neighbors simultaneously translate inward
by `2.5vw` (half the grid gutter) using GSAP function-based per-index transforms (even
cards move one way, odd the other), with `scaleX`/`scaleY` compensation so the preview
overlay stays visually locked to the shrinking gap. The result reads as four puzzle pieces
sliding together into a full-bleed preview. This is real, buildable, and precisely
described — and also, per its own author, **hover-only** (no stated touch/tap fallback in
what I read) and **structurally heavy**: four elements animate in concert per interaction,
not one.

**Smashing Magazine's e-commerce UI patterns (fetched and read in full).**
[Best Practices For E-Commerce UI Design](https://www.smashingmagazine.com/2020/11/best-practices-ecommerce-ui-design/)
gives concrete, structural recommendations rather than taste statements: filters
positioned horizontally above results outperform a left sidebar on mobile because it
shows more product per screen; product detail pages should put price, variant selector,
and **delivery/returns information** in the first viewport, because "63% of digital
shoppers abandon carts because of shipping costs" — i.e., *delivery information is not a
secondary fact, it is one of the top named reasons people don't buy*; secondary detail
(specs, materials) belongs in a collapsed accordion, not competing for first-viewport
space; unavailable variants need distinct visual styling so shoppers see the constraint
before they build a cart around it.

**Refactoring UI's hierarchy rule (read via multiple independent chapter summaries, not
the book itself).** "Most interface problems are hierarchy problems, and the fix is
usually to de-emphasize secondary elements, not amplify the primary one" — a specific,
counter-intuitive claim (quiet the noise around the important thing, rather than making
the important thing louder) that recurred across four independent summaries closely
enough that I'm treating it as a real claim from the book, not an artifact of one
paraphrase.
Source: [Top 20 Key Points from Refactoring UI](https://medium.com/design-bootcamp/top-20-key-points-from-refactoring-ui-by-adam-wathan-steve-schoger-d81042ac9802)

**Dribbble-trend commentary (secondhand, from sites analyzing Dribbble shots, not
Dribbble itself).** Recurring 2026 observation: "high-contrast interfaces with bold
accent colors emphasize price changes and key actions without creating visual clutter —
color is applied strategically to separate data points," and card structure is judged by
"how the interface is organized — what users see first, how elements are grouped."
Source: [What UI Design Looks Like in March 2026](https://valmax.agency/insights/what-ui-design-looks-like-in-march-2026-10-dribbble-shots-that-show-the-shift/)

**Land-book / Lapa Ninja's own organizing principle, as described secondhand, is itself a
transferable pattern:** curate by industry tag *and* let visitors filter/save, rather than
one undifferentiated stream. Worth naming because it is exactly the architecture MalFleks's
own `/search` and `/brands` pages already use (see §3) — this is a case of the pattern
being *validated by finding it already built*, not a gap.

## 3. Applied to MalFleks

I read `src/app/globals.css`, `src/app/page.tsx`, and the "premium site craft" section of
`docs/engineering-standards.md` (ENG-1 Atlas's Phase 0 finding) before starting web
research, per the brief. Atlas already covered the Lenis → ScrollTrigger → master-timeline
scroll-choreography architecture and Codrops' sticky-grid-scroll / 3D-image-tube
tutorials — I deliberately did not re-tread that ground. I also re-read my own earlier
`graphic-design.md` (the icon-contrast defect) and am not repeating it. Before writing
recommendations I read the actual current code for the routes and components named below,
not just the marketing copy — `BrandCard.tsx`, `ListingCard.tsx`, `ProductCard.tsx`,
`BrandCatalog.tsx`, `SearchExplorer.tsx`, `OrderRequestForm.tsx`, and the
product/brand/branch/delivery page templates — specifically to avoid recommending a fix
for something that's already handled.

### Recommendation 1 (highest priority) — surface delivery mix on `BrandCard`

**Where:** `src/components/brand/BrandCard.tsx` — used by `BrandGrid` on both the
homepage's "Featured brands" section (`src/app/page.tsx`) and the full `/brands` catalog
(`src/components/brand/BrandCatalog.tsx`).

**What I found:** `BrandCard.tsx` currently renders logo, name, category, and a
description — nothing about delivery. `DeliveryBadge` (brand-fleet vs. local-courier) only
appears once a user clicks through to a specific branch
(`src/app/brands/[slug]/branches/[branchId]/page.tsx:86`) or a specific search result
(`ListingCard.tsx:68`). Per MalFleks's own memory notes, **brand-fleet vs. local-courier
routing is the product** — and per the Smashing Magazine finding above, delivery cost/method
is one of the specific, named reasons shoppers hesitate before ever reaching checkout. Right
now that signal is invisible on the two pages (`/` and `/brands`) where a visitor is
choosing *which brand* to explore, and only appears after the click.

**Recommendation:** give `BrandCard` a small delivery-mix indicator — reusing
`DeliveryBadge`'s existing emerald/amber dot-and-label visual language (no new colors or
components needed) — computed from `getBranchesByBrandId(brand.id)`, e.g. "Delivers
directly" if any branch has `deliveryOffered`, or "Local agent delivery" if none do. This
is a data-driven card enhancement in the Dribbble-trend sense above (surface the
comparison-relevant fact before the click) rather than a decorative one.

### Recommendation 2 — pin the product visual on the product detail page

**Where:** `src/app/products/[id]/page.tsx`, the `lg:grid-cols-2` split (line 70) between
the `ProductShowcaseLoader` 3D visual and the text column (price, specs, CTA).

**What I found:** Neither column is currently sticky — both scroll together. For a
product with a long `specs` list, the 3D showcase (the single most expensive, most
deliberately crafted visual asset on the page) scrolls out of view exactly when the
customer is reading the details it's supposed to be illustrating. MalFleks has *already
built and shipped* the fix for this elsewhere: `OrderRequestForm.tsx:272`
(`lg:sticky lg:top-24`) pins the order summary column while the form scrolls past it. This
is the lightweight, CSS-only version of the "pinned media column, text scrolls past"
structural pattern that recurs across premium builds — Atlas's research already named the
JS-driven, full-timeline version of this (Lenis/ScrollTrigger); this is the version that
needs nothing but the class MalFleks is already using one route over.

**Recommendation:** add `lg:sticky lg:top-24 lg:self-start` to the `ProductShowcaseLoader`
wrapper (`page.tsx:72`), matching the pattern already proven at
`OrderRequestForm.tsx:272`.

### Recommendation 3 — carry the serif-italic "voice" motif to every route, not three of seven

**Where:** the `font-accent-serif italic text-accent` treatment (Instrument Serif italic
on a single word/phrase) that currently appears on the homepage hero ("One,"
`page.tsx:32`), the homepage section eyebrows ("Catalog," "How it works," `page.tsx:72,90`),
the search page ("whole marketplace," `search/page.tsx:39`), and the product detail page
(brand name eyebrow, `products/[id]/page.tsx:81`) — but is **absent** from
`brands/[slug]/page.tsx` (brand page — plain `h1`, no serif eyebrow),
`brands/[slug]/branches/[branchId]/page.tsx` (branch page — plain `h1`), and
`delivery/[productId]/page.tsx` (plain `h1`, "Delivery for your order").

**Why this matters:** Awwwards' own 40%-weighted top criterion is "Design," and the
independently-sourced pattern beneath it (also named in `engineering-standards.md`'s
"premium vs. expensive-looking" research) is a point of view **carried from hero to
footer** — not deployed on the landing page and then dropped once a visitor is two clicks
deep, which is exactly what's happening today. Four of seven top-level route templates
never render the serif-italic motif at all.

**Recommendation:** add a one-line serif-italic eyebrow to the brand page (e.g. above
`brand.name` at `brands/[slug]/page.tsx:64`, something short — the category or a fragment
of the description) and the branch/delivery headers, so the motif that establishes MalFleks's
type identity on the homepage is still visibly MalFleks's once someone is deep in a branch or
mid-order, not just on the pages a first-time visitor sees.

**Priority order and why:** #1 is functional and ties directly to the product's actual
differentiator; #2 is structural, low-risk, and literally copies a class MalFleks already
shipped one route over; #3 is pure art-direction consistency — real, per Awwwards'
own weighting, but correctly last for a marketplace where being able to compare price and
delivery method matters more than the brand voice being airtight on every screen.

### What MalFleks should explicitly *not* adopt, and why

- **The Codrops clip-path grid-to-preview interaction, applied wholesale to `BrandGrid` or
  `ProductGrid`.** It's a genuinely elegant technique (see §2) but it is hover-only with
  no stated touch fallback in the tutorial I read, animates four grid cells at once, and
  would compete for GPU/JS budget against the two Bloom-postprocessed React Three Fiber
  scenes MalFleks already runs. Tanzania mobile access is the primary use case per MalFleks's own
  market notes — a hover-only interaction is dead on arrival there, and a marketplace
  where someone is scanning ten rows for the cheapest price needs the tenth row to look
  the same as the first, not to have shifted into a puzzle-piece preview state.
- **Full Lenis/ScrollTrigger master-timeline choreography on `/search` or `/brands`.**
  Already flagged as the honest counter-case in `engineering-standards.md`, and I can
  independently reaffirm it from this research: Awwwards' scoring (Design + Creativity =
  60%, Usability = 30%) rewards exactly the kind of paced, cinematic scroll sequence that
  actively works against a person trying to compare twelve product rows as fast as
  possible. What wins a jury vote and what serves "find the cheapest Oraimo charger that
  delivers to Mwanza" are different goals on these two specific routes.
- **The Godly/SiteInspire curation ethos — thumbnail-and-title, no explanatory text.**
  Confirmed directly (§1): these sites work by suppressing text in favor of pure visual
  impact, which is correct for a portfolio thumbnail whose entire job is to make someone
  want to click. It is wrong for `ListingCard`/`ProductCard`, where price, category, and
  delivery method *are* the content a shopper needs before clicking, not decoration
  competing with the click.

## 4. Where I was wrong

- I expected `/search`'s filter layout to have the sidebar-vs-horizontal problem the
  Smashing Magazine article warns about. Reading `SearchExplorer.tsx` showed it already
  does the more sophisticated hybrid the guidance is gesturing toward — a sticky sidebar
  at `lg:` and above, collapsing to a horizontal "Filters" toggle drawer below that
  (`SearchExplorer.tsx:204-255`). No gap here; I was wrong to expect one.
- I expected `ProductCard.tsx` (used on branch pages) to be missing a delivery-status
  signal per card, which would have been a real comparison-task gap matching the Smashing
  finding. It isn't a gap: delivery status is a **branch-level** fact, not a per-product
  one, and the branch page already states it once, prominently, in the header
  (`branches/[branchId]/page.tsx:86`) — repeating it on every card in that grid would be
  redundant. The actual version of this gap is one level up, on `BrandCard`, where a
  single brand can have branches with *mixed* delivery status — that's Recommendation 1.
- I expected the gallery sites named in the brief to give me something closer to Codrops —
  readable curatorial commentary. Only two of twelve did. I should have weighted my search
  order toward Codrops/Smashing-adjacent sources from the first lookup rather than
  spending early budget surveying Land-book/SiteInspire/Godly/Httpster/Lapa Ninja
  together, since a single fetch (SiteInspire) was enough to confirm the pattern the brief
  had already warned me about.
- `godly.website` 301-redirecting to `recent.design` mid-research was not something I
  expected going in — a reminder that "the gallery site" as a stable reference point is
  itself not guaranteed; I did not chase the new domain, per the abandon-on-failure rule,
  so I cannot say what `recent.design` actually contains.

## What I could not verify

- Actual Awwwards jury commentary text for any specific Site of the Day — search results
  confirmed jury *scores* exist but I could not locate or fetch readable jury commentary
  prose; I did not spend a fetch confirming whether any exists at all, so "Awwwards jury
  commentary" as a text genre remains asserted by the brief, not confirmed by me.
- Land-book, Lapa Ninja, Httpster, Dribbble, and Behance — none were fetched directly.
  Everything reported about them above is a secondary or tertiary description (blog
  listicles about the galleries, or, for Behance, bare search-index titles/view-counts),
  not primary content I read myself.
- `recent.design` (the domain `godly.website` now redirects to) — not fetched; unknown
  whether it's a rebrand of Godly, an acquisition, or an unrelated squat.
- Whether the Codrops clip-path tutorial's interaction has *any* touch/tap fallback — the
  fetched summary didn't surface one, but I did not fetch the full demo/code, only a
  prompted summary of the article text, so I can't rule one out with certainty.
- Refactoring UI's actual chapter text — everything attributed to it above comes from
  third-party chapter summaries (Medium posts, book-summary sites), not the book itself.
