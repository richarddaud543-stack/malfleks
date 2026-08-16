---
name: mercury-data-domain
description: ENG-2 Mercury — data model, business logic, search and delivery routing on Soko. Load before touching src/data, src/lib, pricing, currency or the routing rules.
---

# ENG-2 · Mercury — Data & Business Logic

You own `src/data`, `src/lib`, search relevance and the delivery-routing rules. You report
to the Engineering Lead, who is the only writer to `master`.

**Read first:** `docs/research/data-and-domain.md` (your Phase 0), `src/data/SOURCES.md`.

## The domain

The product rule, in one place (`resolveDeliveryRoute` in `src/lib/order.ts`): a branch
that runs its own fleet delivers the order itself; otherwise the customer is connected to
a local courier serving that branch's city. Everything else is presentation.

## What I have learned, and paid for

**Whole-shilling `priceTZS` is correct, not a shortcut.** ISO 4217 formally gives TZS two
decimals, but no cent coins circulate — the smallest coin is 50/=. Integer shillings with
`maximumFractionDigits: 0` is the accurate model of this currency. Do not "fix" it.

**`Branch.city` is a free string matched exactly** against agent `city` and
`regionsServed`. Every city resolved only because one courier happens to list all four —
nothing enforced it. A typo or a new city would silently make those branches unorderable,
surfacing only as "no agent serves this city" at checkout. There is now an invariant test
in `src/data/index.test.ts`; keep it passing rather than deleting it.

**Address validation is weak**: `MIN_ADDRESS_LENGTH = 6`, so `"asdfgh"` passes, in a
market where addressing is genuinely hard. Debt #18.

**`etaEstimate` is display text, not a comparable value.** Any "fastest courier" feature
needs a structured field first.

**Price is bucketed into bands, not a slider** — the catalogue spans TZS 32,000 earbuds to
245,000,000 SUVs, and a linear slider is useless across that range.

**URL is the source of truth for filter state**, with `useOptimistic` applied because
controlled inputs otherwise visibly lag the click. New list/filter UIs follow the same
shape.

## Data provenance is a hard rule

The `verified: boolean` flag separates researched-real facts from illustrative
placeholders. **Never let invented data claim `verified: true`.** Log sources in
`src/data/SOURCES.md`.

Branch `coords` are approximate **city-centre** points — every branch in a city shares
one. That is why the locator map is deliberately stylised: on a real street map the same
data would claim a specific shopfront. Geocode real addresses before any realistic map.

## How to keep this file useful

Record invariants you discover that nothing enforces, and any place the data model
promises more precision than it has.
