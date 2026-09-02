# Data & business logic — research (ENG-2 · Mercury, Phase 0)

2026-08-15. Scope: `src/data/`, `src/lib/search.ts`, `src/lib/order.ts`, `src/lib/format.ts` — catalogue
modelling, search relevance, money handling, delivery routing.

No video material was consulted anywhere in this document — I cannot watch video, and every source
below is something I fetched or searched as text, so nothing here needs a "secondary, video-derived"
marker; there simply isn't a video source to mark.

## 1. Who to learn from

- **Baymard Institute** (baymard.com) — the primary source for ecommerce filtering/search UX; a
  nine-month usability study across 19 sites, not opinion. Worth a subscription before any facet UI
  redesign, not just the free blog posts.
- **Bank of Tanzania / Wikipedia's Tanzanian shilling page** — ground truth on what the currency
  actually looks like in circulation, as distinct from its formal ISO definition. Cross-check anything
  ISO-4217-derived against the actual central bank for the market you're building for.
- **BM25 primary/vendor documentation** — Microsoft Learn's Azure AI Search similarity docs and
  OpenSearch's keyword-search docs describe the algorithm itself rather than paraphrasing it; better
  than the aggregator blogs that also turned up.
- **commercetools product-modelling docs** — a real headless-commerce vendor's reference for how
  product/variant/SKU splits are actually implemented, useful as "how a production catalogue engine
  does this," not as a spec to copy.
- **what3words' own writing on African deployments** — practitioner material on the addressing problem
  in the geography MalFleks targets, not just the general "geocoding is hard" take.
- **Chris Krycho, Khalil Stemmler, DevIQ on "make illegal states unrepresentable"** (the phrase
  traces to Yaron Minsky) — direct treatments of the type-system principle, in TypeScript specifically
  for the first two.

## 2. What current practice says, by theme

### Money handling

Universal advice: never use float/double for currency; store integer minor units and keep floats out
of the computation path entirely — [Modern Treasury](https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents),
[evertpot](https://evertpot.com/currencies-floats/). ISO 4217 assigns TZS a minor-unit exponent of 2
(100 cents) — [iotafinance currency table](https://www.iotafinance.com/en/Currencies.html). But the
[Tanzanian shilling's Wikipedia page](https://en.wikipedia.org/wiki/Tanzanian_shilling) records that no
cent coins are in circulation: the smallest coin is 50/=, the smallest note 500/=. The formal ISO
subdivision and the transactable reality have diverged.

### Search relevance & faceting

Modern pipelines run BM25 or vector similarity over the full candidate set, then re-rank the top 50–100
by CTR/conversion/price/inventory signals — [Hybrid Search reference, 2026](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026).
BM25 itself remains the default because it fixes TF-IDF's raw term-frequency inflation with saturation
and document-length normalization, at the cost of still having no notion of synonyms —
[ParadeDB, "What is BM25?"](https://www.paradedb.com/learn/search-concepts/bm25),
[Azure AI Search similarity docs](https://learn.microsoft.com/en-us/azure/search/index-similarity-and-scoring).
On faceting specifically, Baymard's guidance: real-time filtering is preferred on desktop, an explicit
"Show N results" button is preferred on mobile because live re-filtering there disorients mid-interaction,
and each facet's count must exclude that facet's own active selection or a checked box zeroes out its
siblings — [Baymard, ecommerce filter UI](https://baymard.com/learn/ecommerce-filter-ui).

### Multi-vendor marketplace domain design

Real multi-vendor marketplaces separate the *product* from a seller's *commercial offer* on it — a
single-vendor store can conflate the two, a marketplace can't —
[Evinent, multi-vendor catalog management](https://evinent.com/blog/multi-vendor-catalog-management-scale).
Fulfillment splits into seller-fulfilled vs. platform/3PL-fulfilled, the same binary MalFleks encodes as
brand-fleet vs. local-agent; once orders can span multiple sellers, partial fulfillment and partial
cancellation become first-class problems — [Walmart Marketplace fulfillment guide](https://www.spscommerce.com/community/articles/setting-up-shipping-on-walmart-marketplace).
MalFleks doesn't have multi-line, multi-seller orders yet (one product per order request), so this is a
"watch for it," not a current gap.

### Address & location data quality

Street addressing is frequently absent or unreliable across developing markets, and precise
geocoding systems (what3words being the cited example) exist specifically to solve last-mile delivery
in unaddressed towns and cities, including deployments in Uganda —
[what3words, e-commerce & logistics](https://what3words.com/news/blog/from-checkout-to-delivery-how-do-what3words-addresses-flow-through-the-e-commerce-and-logistics-ecosystem),
[Africa's big address problem, Alts.co](https://alts.co/africas-big-address-problem/). Industry figures
cited: 65% of retailers say failed deliveries from bad addresses hurt profitability, average cost per
failed delivery ~$16.58 (general industry number, not Tanzania-specific — flagged as unverified for this
market below).

### Domain typing

"Make illegal states unrepresentable": encode invariants in the type system so the compiler rejects
invalid states instead of a runtime check catching them later; discriminated unions are TypeScript's
mechanism for it — [DevIQ](https://deviq.com/principles/make-illegal-states-unrepresentable/),
[Chris Krycho, in TypeScript specifically](https://v5.chriskrycho.com/journal/making-illegal-states-unrepresentable-in-ts/).

## 3. Audit of MalFleks's data and logic

### Money — correct, and correct for a more specific reason than I expected

Every `priceTZS` in `src/data/products.ts` is a bare integer literal, from 2,000 (`halotel-sim-starter`)
to 245,000,000 (`bmw-x5`). `calculateLineTotal` (`src/lib/order.ts:80-88`)
multiplies two integers — exact under IEEE-754 doubles up to 2^53, and the worst case
(245,000,000 × `MAX_QUANTITY` = 99) is 24,255,000,000, nowhere near that ceiling. `formatTZS`
(`src/lib/format.ts:1-7`) formats through `Intl.NumberFormat` with `maximumFractionDigits: 0`. No float
ever touches a shilling amount and there is no rounding anywhere in the path.

**Gap, not in the debt register:** nothing in `src/data` or `src/lib` enforces integer/non-negative
prices at the type or runtime level — that validation exists only in `prisma/seed.ts` (per
`docs/backend.md`), a layer the live site doesn't read from yet. A malformed literal
(`priceTZS: 45000.5`) added to `products.ts` today would ship silently, and `formatTZS` would even
round it invisibly on display rather than error.

### `searchProducts` — defensible today; the debt register already found the real scaling failure

`scoreListing` (`src/lib/search.ts:135-166`) is a field-weighted best-match heuristic — name-prefix 100,
name-includes 70, brand 50, category 40, city/branch-name 25, description/specs 10, summed per ANDed
term. It is not BM25: no term-frequency saturation, no document-length normalization, no typo
tolerance. At 38 products that's the right trade — explainable, deterministic, and fully covered by
`src/lib/search.test.ts`.

The scaling risk isn't the scoring formula, it's the execution model, and **debt #6 already names it
correctly**: `SearchExplorer` is a client component calling `searchProducts()` with the default
`listings = getListings()`, so this scan runs as repeated `.includes()` calls over every field of every
listing, in the browser, on every filter change. `docs/backend.md` independently proposes the fix — a
trigram/full-text index once search moves server-side — which is exactly what the BM25 research above
converges on. I have nothing to add to #6 beyond confirming it from the relevance-research side: the
fix is moving the scan off the client before it's 100x longer, not a smarter scoring function.

Facet counting (`countBy`, `src/lib/search.ts:241-257`) already excludes each dimension's own filter so
a checked box doesn't zero its own siblings — precisely the failure mode Baymard's research names, and
MalFleks avoids it.

### Domain types — model the current fixtures well, with two gaps that will bite before "100x"

1. **`Branch.city` is a bare `string`** (`src/data/types.ts:18`), matched by exact `===`/`.includes()`
   in `getAgentsForCity` (`src/data/index.ts:38-42`) and in the search city facet. Nothing in the type
   system stops a typo'd city (`"arusha"` vs. `"Arusha"`) from silently producing zero delivery agents
   for every branch in that city. `orderBlockReason` (`src/lib/order.ts:58-71`) would then correctly
   refuse every order from that branch — for a data-entry reason nobody would think to check. I checked
   today's actual data: all four cities (Dar es Salaam, Arusha, Mwanza, Dodoma) resolve to at least one
   covering agent, because Fargo Courier's `regionsServed` happens to list all four. That's incidental,
   not enforced — no test in `src/data/index.test.ts` or `src/lib/search.test.ts` asserts "every
   branch's city has ≥1 covering agent," so a fifth city added without a matching agent (or with a
   mistyped name) would break silently. This is the concrete version of the "illegal states" principle
   above: a literal union of known cities, or a standing data-integrity test, would catch it at build
   or test time instead of at checkout.
2. **`DeliveryAgent.etaEstimate` is free text** (`src/data/types.ts:54`) — `"Same-day"`, `"1–2 days"`,
   `"1 day"`. Fine for display, but not sortable or comparable. If MalFleks ever wants to route to the
   fastest or cheapest agent — arguably the actual value the "agent" side of the product rule is
   supposed to deliver — there's no structured field to compute that from today.
3. **`Branch.country: "Tanzania"` is a single-value literal.** This is the type system doing its job —
   you cannot construct a non-Tanzania branch — and I'm naming it only because it's the one place in
   the domain model that would need a real type change, not a config tweak, if MalFleks ever expanded
   beyond one country.
4. Worth flagging forward rather than as a defect: `Product` has no variant concept — an iPhone in two
   storage sizes would be two full `Product` rows with duplicated name/description, not a
   parent-product-plus-variants split (the pattern commercetools' docs describe). At 6 brands and 38
   products this costs nothing; it's the first thing that gets expensive if Oraimo or Apple SKUs
   multiply by colour/storage.

### Address quality — the branch side is honestly documented; the customer side has the same gap, untracked

`src/data/SOURCES.md` is explicit that `Branch.coords` are city-centroids, not shopfront positions, and
flags geocoding real addresses as pre-launch work — good practice, and it matches the research above
almost exactly: this is precisely the class of problem what3words-style systems exist to solve in
under-addressed African cities.

But the customer's own delivery address has the identical problem one step further down the funnel,
with no equivalent flag anywhere. `validateOrderRequest` (`src/lib/order.ts:182-235`) only checks
`address.trim().length >= MIN_ADDRESS_LENGTH` (6 — `src/lib/order.ts:180`), so `"asdfgh"` passes.
`orderBlockReason` blocks an order on stock and on courier coverage, never on whether the address is
usable. Given the research above states bad-address failed deliveries are a real, costed problem, and
Tanzania is exactly the market where street addressing can't be assumed, this is a live gap that isn't
in the debt register — #13 (route computed too late) is about *when* the route is decided, not about
whether the address feeding that route means anything once it's decided.

### Delivery routing rule — correct, small, and genuinely singular

`resolveDeliveryRoute` (`src/lib/order.ts:35-39`) is a pure function of `Branch`, five lines, and it is
the entire product rule in one place — I found no second implementation or duplicated brand-fleet/
local-agent check anywhere else in `src/data` or `src/lib`. Debt #13 (route computed one page too late)
is a UI-sequencing problem, not a data-layer one: `resolveDeliveryRoute` could be called from
`/products/[id]` today with zero changes to anything I own.

## 4. Where I was wrong

- I assumed TZS, like most currencies, has cents in active use, and read "store whole shillings" as a
  pragmatic simplification for a prototype — something to flag as a risk to revisit. The research
  showed the opposite: TZS formally subdivides into 100 cents (ISO 4217 exponent 2), but no cent coins
  have circulated for years — the smallest coin is 50/=, the smallest note 500/=. MalFleks's integer-shilling
  model isn't a simplification against a "more correct" ISO standard; it's the accurate model of how the
  currency is actually transacted. I no longer think this is a risk worth flagging.
- I expected the missing BM25/TF-IDF scoring to be the headline search finding. It's a non-issue at
  current catalogue size, and the debt register (#6) had already found and correctly diagnosed the real
  scaling problem — the client-side linear scan — before I started. My research confirmed the direction
  of the fix rather than surfacing something new.

## What I could not verify

- The "no cent coins in circulation" claim and the 50/=-coin / 500/=-note figures come from Wikipedia's
  Tanzanian shilling article, not a direct fetch of the Bank of Tanzania's own site — I didn't reach
  bot.go.tz directly.
- Baymard's specific numbers (700 usability problems across 19 sites, 38% of sites missing filters for
  displayed info) come from a search-result summary of Baymard's own site, not a direct fetch of the
  primary report page — the topline conclusions are consistent across independent write-ups, but I
  haven't verified the exact figures firsthand.
- The "65% of retailers / $16.58 average failed-delivery cost" figures are a general industry statistic
  surfaced in a what3words-adjacent search result, not sourced to a named study, and not Tanzania-specific.
  Treat as directional, not a number to cite as fact.
- Whether adding a literal union (or branded type) for `Branch.city` has any cost at the Prisma layer —
  I didn't open `prisma/schema.prisma`, which is Forge's file, not mine.
