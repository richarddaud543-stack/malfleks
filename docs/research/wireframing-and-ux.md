# Wireframing & UX — Phase 0 research (ENG-5 · Beacon, 2026-08-15)

Scope: wireframing craft and the UX practice around it — IA, user flows, fidelity,
grid/responsive structure, and how wireframes actually function on a product team.
Read against Soko's real pages in `src/app` and their components.

## 0. An honesty note before anything else

I could not retrieve spoken video content from any YouTube channel. `WebFetch`
against every channel `/videos` page and one specific `watch?v=` URL returned
nothing but YouTube's client-rendered SPA shell — footer navigation links, no
title, no description, no transcript. This happened consistently across three
separate attempts (Flux Academy, DesignCourse, a named Jesse Showalter video),
so it isn't a one-off fetch failure — YouTube's watch/channel pages are not
scrapeable this way. Everything below about specific creators is therefore
built from **secondary sources I did fetch successfully**: aggregator write-ups,
creators' own bios on LinkedIn/their own sites, and channel descriptions
surfaced in search results — not from watching or transcribing a single video.
Where a claim rests only on an aggregator's word, I've said so. The one place I
have primary-source, fetched, dated content is Nielsen Norman Group's written
articles, which is why they carry most of the weight in section 2.

## 1. Who to learn from

Ranked by how much I could actually verify, not by presumed popularity.

- **Nielsen Norman Group** — not a YouTube-first channel, but publishes both
  articles and short videos ("Prototypes vs Wireframes in UX Projects,"
  "Presenting Low-Fidelity Prototypes to Stakeholders"). This is the only
  source in this list I fetched and read directly rather than took on faith.
  Use it for the vocabulary and evidence base, then judge the YouTube
  personalities below against it.
- **Jesse Showalter** (`youtube.com/@jesseshowalter`) — design agency owner,
  weekly UI/UX and web-design videos, ~400K subscribers per his own site copy.
  Repeatedly named specifically for wireframe-to-prototype workflow in Figma
  across multiple aggregator lists. Best-verified of the individual creators,
  but still verified by reputation, not by content I watched.
  [jesseshowalter.com/projects/youtube](https://www.jesseshowalter.com/projects/youtube)
- **Flux Academy** (Ran Segall) — project-based: wireframe → prototype →
  built site, oriented at freelance/agency web design rather than enterprise
  product UX. Good for seeing wireframing as one step in a shipped deliverable,
  not an isolated exercise.
- **CareerFoundry's channel** — search results describe it as process- and
  methodology-heavy (framing research questions, synthesis, structured
  curriculum) rather than tool tutorials. Best fit for a beginner who wants the
  "why," worse fit for someone who already knows the craft and wants technique.
- **DesignCourse, AJ&Smart** — named constantly alongside the above in
  aggregator lists, but I could not independently confirm what either
  currently teaches about wireframing specifically (channel pages didn't
  render). Listed because they come up too often to omit, not because I can
  vouch for them the way I can the others.

Treat this list as "worth a look," not "verified excellent" — the honest
version of that ranking given what actually loaded.

## 2. What current practice says, by theme

### Fidelity is a choice about the test, not a maturity ladder

NN/g's guidance is that low- and high-fidelity each buy something specific, and
picking one is about what you're testing, not how "finished" the work is:
low-fidelity means "less time to prepare... more time to work on design, before
the test," lets you "make design changes more easily during the test," and "put[s]
less pressure on users." High-fidelity buys "realistic (faster) system response,"
which matters when you're testing whether an interaction *feels* right, not just
whether the structure makes sense. The one sharp warning: a broken or wrong
screen mid-test actively misleads users into thinking the *task* is wrong, not
the prototype — so whatever fidelity you pick, it has to be reliable at that
fidelity.
[NN/g, UX Prototypes: Low Fidelity vs. High Fidelity](https://www.nngroup.com/articles/ux-prototype-hi-lo-fidelity/)

### Wireframes are a communication tool, not a spec document

The mechanical conventions NN/g teaches (thick lines for headers, thin for body
text, a crossed rectangle for an image placeholder) exist so a designer can move
fast without needing to draw well: "messy is completely fine and expected,
especially for low-fidelity wireframes." The point isn't the artifact, it's
using it to get a room to agree on structure before anyone touches pixels.
[NN/g, How to Draw a Wireframe (Even if You Can't Draw)](https://www.nngroup.com/articles/draw-wireframe-even-if-you-cant-draw/)

### Plain wireframes fail on stateful, dynamic UI — this is where "wireflows" come in

NN/g names the exact gap that matters for Soko: wireframes are for static pages,
and struggle once a page "change[s] the content and layout dynamically... based
on interactions the user has with the product." A flowchart alone isn't the fix
either — it "typically leave[s] out the context of the interactions and its
impact over users." Their answer is the *wireflow*: real screen layouts
connected by flowchart-style arrows, with the arrows required to "clearly
indicate the clickable 'hotspots'... in order to lessen ambiguity" for whoever
builds it.
[NN/g, Wireflows: A UX Deliverable for Workflows and Apps](https://www.nngroup.com/articles/wireflows/)

This is a direct, checkable gap in Soko today. `SearchExplorer.tsx`,
`CityLocator.tsx`, and `OrderRequestForm.tsx` are exactly this class of
component — URL-synced filter state, optimistic updates, multi-step validation
with focus management on error. None of that state machine is written down
anywhere; it exists only as code. A new engineer picking up
`OrderRequestForm.tsx` has to read the `FIELD_ORDER` comment and the
`validateOrderRequest` call to reconstruct what a wireflow would show in one
diagram: which field gets focus on which error, what "agent required" blocks
submission, what happens to `sessionStorage` if it's unavailable. Not urgent,
but worth a debt-register line if this component gets touched by someone who
didn't write it.

### AI in the wireframing process is a documented practice, older than it sounds

NN/g's "promptframe" concept — a wireframe annotated with the actual prompts
that will generate its placeholder content, so stakeholders react to real
content instead of Lorem Ipsum — reads like 2026 material in aggregator
summaries. It's dated **17 May 2024**. Worth knowing before citing it as
cutting-edge: it predates most of the current AI-tooling conversation, it just
hasn't diffused into general practice yet.
[NN/g, Promptframes: Evolving the Wireframe for the Age of AI](https://www.nngroup.com/articles/promptframes/)

### Deep hierarchies need breadcrumbs; shallow ones don't

NN/g's breadcrumb guidance is conditional, not a blanket "always add
breadcrumbs": they're not useful on flat, 1–2-level or linear sites, but for
deeper ones they "afford one-click access to higher site levels" and "rescue
users who parachute into very specific but inappropriate destinations through
search or deep links" — which is exactly how Soko's search results and shared
`/locator?city=` links work. The guidance also caps it: breadcrumbs "realistically
can support only 2–3 tiers before it intrud[ing] too much upon the main content
space."
[NN/g, Breadcrumb Navigation Increasingly Useful](https://www.nngroup.com/articles/breadcrumb-navigation-useful/)

Soko's real hierarchy is `Home → Brands → Brand → Branch → Product → Delivery →
Confirmation` — six tiers, past NN/g's own 2–3-tier comfort limit for a
breadcrumb trail alone. Current navigation is a single "← previous page" link
present on some pages (branch page links to its brand, product page links to
its branch, delivery page links to its product) and **absent on the brand
page**, which has no way back to `/brands` except the browser's back button or
retyping the nav link. That's a gap in an otherwise-consistent pattern, not a
new pattern to invent.

### Mobile-first does not mean "the same UI on every screen"

NN/g's finding here is that porting mobile patterns unchanged to desktop
actively damages desktop usability — sites that hid navigation behind hamburger
menus or search icons on desktop saw people use navigation less, and the paper
is explicit that this wasn't because desktop users needed navigation less: "the
reason why people used navigation less on the desktop was *not* that they
didn't need it." The fix is deliberate divergence: "different devices have
different capabilities of interaction and different screen sizes," and content
parity does not require UI parity.
[NN/g, Mobile First Is NOT Mobile Only](https://www.nngroup.com/articles/mobile-first-not-mobile-only/)

This is one place Soko already does the right thing rather than the wrong one,
worth confirming rather than assuming: `Navbar.tsx` shows a plain horizontal
link row on `sm:` and up and only collapses to a hamburger below that, and
`SearchExplorer.tsx` gives desktop a persistent sticky facet sidebar
(`lg:sticky lg:top-24 ... lg:block`) while mobile gets a togglable panel
(`AnimatePresence` + a "Filters" button) — genuinely different components per
breakpoint, not one component with `display: none`. That's the pattern NN/g is
asking for.

## 3. A real wireframe pass on Soko

Read: `src/app/page.tsx`, `src/app/brands/page.tsx`, `src/app/brands/[slug]/page.tsx`,
`src/app/products/[id]/page.tsx`, `src/app/delivery/[productId]/page.tsx`,
`src/app/search/page.tsx`, `src/app/locator/page.tsx`, `src/app/agents/page.tsx`,
and their components (`BrandCard`, `BrandGrid`, `BranchCard`, `ListingCard`,
`ProductCard`, `DeliveryBadge`, `Navbar`, `Footer`, `CityLocator`,
`SearchExplorer`, `OrderRequestForm`).

The core product idea — brand-fleet delivery vs. local-courier delivery — is
articulated clearly *in prose* on the homepage and delivery page. The weakest
screens are the ones where that idea is present as a fact (a colored pill) but
not explained or reinforced at the moment a first-time visitor actually needs
it. All three wireframes below are about moving information earlier, not about
visual redesign.

### 3a. Homepage (`/`) — the "how it works" explainer is one scroll too late

Today's section order: hero (headline + paragraph + 3D scene + three equal-weight
CTAs) → **Featured brands grid** → **How delivery works** (the two-path
explainer cards). A visitor who reads the headline, likes a brand logo, and
clicks straight into `/brands/toyota` never sees the explainer section at all —
it's behind the thing most likely to pull them away first. The hero paragraph
does state the rule once, but it's dense prose sitting next to a large 3D
scene competing for the same attention; nothing in the hero *shows* the two
paths the way the explainer cards do.

Second issue: the hero offers three CTAs of equal visual weight — "Explore
brands" (primary), "Search products," "Delivery agents" (both secondary,
`MagneticButton variant="secondary"`, same size). "Delivery agents" is a page
about couriers — it's meaningless to someone who hasn't yet hit a branch that
needs one. Putting it in the hero as a first-class action asks a first-time
visitor to make a choice they don't have the context to make yet.

**Task this serves:** a first-time visitor in the first five seconds should be
able to say what Soko is and what the colored dot on a listing means, before
they've clicked anything.

Proposed structure:

```
┌────────────────────────────────────────────────────────────────┐
│ Soko.                       Search   Brands   Near Me   Agents  │
├────────────────────────────────────────────────────────────────┤
│  ● Now live across Tanzania                                     │
│                                                                   │
│  Every brand branch.                       ┌─────────────────┐  │
│  One delivery promise.                     │                 │  │
│                                             │   [3D hero]     │  │
│  Browse authorized branches from Toyota,   │                 │  │
│  Ford, BMW, Oraimo, Apple and Halotel.     │                 │  │
│                                             └─────────────────┘  │
│  ┌───────────────────────┐ ┌───────────────────────┐            │
│  │ ● Brand delivery       │ │ ○ Local agent delivery │  <- moved │
│  │ The branch ships it    │ │ We connect you to a    │  up from  │
│  │ themselves.             │ │ vetted courier.        │  below   │
│  └───────────────────────┘ └───────────────────────┘  the fold  │
│                                                                   │
│  [ Explore brands → ]   [ Search products ]     <- 2 CTAs, not 3 │
└────────────────────────────────────────────────────────────────┘
│  Featured brands                                     View all → │
│  [Toyota]  [Ford]  [BMW]  [Oraimo]  [Apple]  [Halotel]           │
└────────────────────────────────────────────────────────────────┘
```

Changes and why: the two delivery-path cards move from third section to
directly under the hero copy — they were already built, this is a reorder, not
new work. "Delivery agents" drops out of the hero CTA row (it stays reachable
from the nav and footer, where a returning or already-oriented user finds it);
the hero keeps one primary and one secondary action instead of three
co-equal ones, so the page states a clear next step instead of a menu of
options.

### 3b. Product page (`/products/[id]`) — the delivery decision is hidden one click past where it's needed

The product page shows price, spec table, stock, and a single `DeliveryBadge`
pill ("Brand delivery" / "Local agent delivery") next to the stock line. To
learn *what that actually means* — whether the brand ships it directly, or
which courier serves that city and how long it takes — the user has to click
"Order & choose delivery" through to `/delivery/[productId]`, a full page
navigation, before seeing any of that detail. `resolveDeliveryRoute()` and the
agent list with `etaEstimate` already exist in `src/lib/order.ts` and are
computed on the delivery page — the data just isn't surfaced one page earlier,
at the point where someone is still deciding whether to commit to the click at
all.

**Task this serves:** deciding whether to order *before* starting the order
flow, not after.

```
┌────────────────────────────────────────────────────────────────┐
│ ← Mwanza Branch                                                  │
│                                                                   │
│ ┌─────────────────┐   Toyota                                    │
│ │                 │   Corolla Cross                              │
│ │   [3D product]  │   VEHICLES · TZS 68,000,000                  │
│ │                 │   Description text…                          │
│ └─────────────────┘                                              │
│                                                                   │
│                       ┌──────────────────────────────────────┐  │
│                       │ ● Brand delivery                     │  │  <- NEW:
│                       │ Toyota Tanzania delivers this        │  │  panel, not
│                       │ directly. No courier needed.         │  │  just a pill
│                       └──────────────────────────────────────┘  │
│                       (or, for an agent route:)                 │
│                       ┌──────────────────────────────────────┐  │
│                       │ ○ Local agent delivery               │  │
│                       │ 3 couriers serve Mwanza —              │  │
│                       │ fastest estimate ~2 days              │  │
│                       └──────────────────────────────────────┘  │
│                                                                   │
│                       Engine | Seats | … (specs table, unchanged)│
│                                                                   │
│                       [ Order & choose delivery → ]              │
│                       Available at Mwanza Branch, Mwanza          │
└────────────────────────────────────────────────────────────────┘
```

This doesn't remove the delivery page — agent *selection* and the order form
still belong there. It moves the *decision-relevant summary* (which of the two
paths, and the fastest ETA if it's the agent path) one screen earlier, so
clicking "Order & choose delivery" is committing to a known outcome instead of
being how you find out what the outcome is.

### 3c. Brand page (`/brands/[slug]`) — no way back, and no delivery summary at the level where it would help most

Two separate small gaps that compound. First: every other detail page in this
chain links back one level (branch page → "← {brand}", product page → "←
{branch}", delivery page → "← {product}") except the brand page, which has no
link back to `/brands` at all — only the sticky nav or the browser back button.
That's an inconsistency in an otherwise-consistent pattern, not a new idea.

Second, and more substantive: a brand with multiple branches shows each
branch's delivery status individually on its card, but nothing summarizes the
split at the brand level. With ~3 branches per brand today that's a minor
scan cost; it stops being minor once a brand has a dozen branches across
Tanzania, at which point the exact thing the product is supposed to make
obvious — how many of this brand's branches will ship it themselves — takes
individual card-by-card scanning to answer.

**Task this serves:** comparing branches of one brand, specifically on the
delivery-method axis the whole product is organized around.

```
┌────────────────────────────────────────────────────────────────┐
│ Home / Brands / Toyota                       <- NEW breadcrumb  │
│                                                                   │
│ [Logo]  Toyota                                                   │
│         AUTOMOTIVE                                               │
│ Authorized dealer network for Tanzania…                          │
│                                                                   │
│ ● 2 of 3 branches deliver directly            <- NEW, one line, │
│   the rest connect you to a local courier         computed from │
│                                                     data already  │
│                                                     on the page   │
│                                                                   │
│ Branches (3)                                                     │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐            │
│ │ Branch A       │ │ Branch B       │ │ Branch C       │            │
│ │ address, hours │ │ address, hours │ │ address, hours │            │
│ │ ● Brand deliv. │ │ ○ Local agent  │ │ ● Brand deliv. │            │
│ └───────────────┘ └───────────────┘ └───────────────┘            │
└────────────────────────────────────────────────────────────────┘
```

The breadcrumb is one link, not a full breadcrumb component library — at this
depth (5–6 tiers) NN/g's own guidance caps a *useful* breadcrumb trail at 2–3
tiers before it crowds the content, so I'm not proposing `Home / Brands /
Toyota / Mwanza Branch / Corolla Cross` on every leaf page. A single "back to
the parent list" link, consistently present on every detail page (which is
almost true today — the brand page is the one gap), is what the source
material actually supports here, not a deeper breadcrumb component.

## 4. Where I was wrong

- **I expected to be able to summarize actual video content and couldn't.**
  Every YouTube page WebFetch touched came back as an unrendered SPA shell.
  I adjusted by leaning entirely on NN/g's written articles (which fetch
  cleanly and are dated) and by being explicit above about which channel
  claims rest on reputation rather than verified content. A padded list of
  ten channels with invented one-liners would have been easy to write and
  wrong to trust.
- **I assumed "promptframes" and AI-assisted wireframing were current,
  2025/2026-era material** because that's how search aggregators framed the
  hits. The source article is dated May 2024. Worth citing, wrong to present
  as a hot new practice.
- **I assumed Soko's split mobile/desktop nav and filter UI was worth
  flagging as a smell** — a hamburger menu on mobile only, a completely
  different sticky-sidebar component on desktop. NN/g's mobile-first research
  says the opposite: porting one UI to every breakpoint is the mistake, and
  deliberately different components per device is correct. This is a case
  where reading the research changed a "finding" into a "this is already
  right" — worth recording so nobody re-flags it.
- **The handbook's own framing of what makes Soko's 3D work premium — "scene
  logic, not page logic," choreography over a page hierarchy — sits in real
  tension with what NN/g's IA material says about Soko's actual page
  hierarchy** (six tiers deep, thin back-navigation). Both are correct in
  their own domain: the hero is a scene, but everything past it is an
  e-commerce hierarchy that needs the boring wayfinding an immersive site
  doesn't. Worth naming explicitly so the "no breadcrumb" gap doesn't get
  waved off as inconsistent with the site's design language — it's a
  different problem than the hero solves.
