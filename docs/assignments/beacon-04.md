# BEACON-04 · The honesty pass, and IA for the new routes

**Assigned to** ENG-5 · Beacon — SEO, content, metadata, information architecture
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 1
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

**Item 1 is the most valuable thing anyone does this round.** On 2026-08-25 the order flow
started writing a real `Order` row to the database. Before that, an order request was built
in the browser, held in `sessionStorage`, and transmitted nowhere — and the confirmation
screen said so, in plain words, deliberately.

That copy is now false. Somewhere on this site, Soko is telling customers their request
goes nowhere while the server writes it to a table an admin reads. That is the exact
category of defect this role exists to catch, and it is worse than a missing meta tag by
several orders of magnitude.

The correction has to cut both ways, which is the hard part.

---

## Phase 0 — Onboarding (do this first, record it)

Into `docs/research/web-development.md` or your IA research file, whichever fits:

1. **Disclosure norms for a marketplace that takes no payment.** What do comparable
   platforms actually say at the point where a customer submits a request that is not a
   purchase? Primary sources: real sites, real screens, not listicles.
2. **`noindex` and sitemap handling for authenticated sections** in Next.js 16 App Router
   — the current correct mechanism, given `/account` already does this and
   `/partner`/`/admin` will need it.

---

## Phase 1 — Build

### 1. The honesty audit — both directions

Walk every surface a customer touches in the order flow and reconcile the words against
what the system now actually does.

**What is now true and must be said:** the request is recorded. It persists beyond the
browser tab. A Soko admin can see it. It has a status that a person will move.

**What is still not true and must never be implied:** no money has moved. No payment has
been taken or authorised. The branch has **not** been notified — nothing is transmitted to
them, and `docs/backend.md` is explicit that "confirmed" still means no money moved. There
is no partner-facing order queue at all yet.

So the correction is not "delete the disclaimer" — it is a rewrite in both directions. A
customer reading the confirmation screen should come away knowing their request is real and
recorded, and equally knowing that nobody has been paid and no shop has been told yet.

Start with `src/components/order/OrderConfirmation.tsx`,
`src/components/order/OrderRequestForm.tsx`, `src/components/order/OrderSummary.tsx` and
`src/app/order/confirmation/page.tsx`, then grep the whole `src/` tree for the old claim —
it will be in more places than you expect, including comments and test assertions. Where a
test asserts the old copy, the test is now asserting a lie: change it and say so in your
report, do not quietly delete it.

**Ledger is building a fee module this same round (LEDGER-03) and it is explicitly barred
from any customer-facing surface.** If you find a deposit amount rendered to a customer
anywhere, that is a defect — report it immediately rather than fixing it yourself.

### 2. `/apply` copy, re-checked

`/apply` shipped 2026-08-23 telling applicants an admin will review their application. The
admin queue shipped the same day, so that is now accurate — confirm it, and confirm the
page does not promise a reply timeframe Soko has no mechanism to keep. Check
`src/app/apply/page.tsx` and `src/components/apply/PartnerApplicationForm.tsx`.

### 3. IA and metadata for the new routes

Atlas is building `/partner` and extending `/admin` this round (ATLAS-11). Land the
structure ahead of the pages so the routes are right the first time:

- Every new route gets page-specific `metadata` or `generateMetadata`, using the root
  layout's `%s — Soko` title template. That is the standing baseline.
- `/partner/**` and `/admin/**` are **`noindex`, and absent from `src/app/sitemap.ts`** —
  same treatment `/account` already has. Verify `/account`'s treatment is actually correct
  while you are in there rather than assuming it.
- Check `src/app/robots.ts` covers them.
- Decide the URL contract for the partner surface and write it down: is it
  `/partner/orders` and `/partner/products`, or a single `/partner` with tabs? Atlas
  implements what you decide, so decide it in this assignment and state it plainly. You
  own the route contract; you have the `/agents` precedent in debt register row #3 for why
  a URL contract is not a free thing to change later.

### 4. The catalogue count in metadata

`src/app/search/page.tsx` imports `products` from `src/data` solely for `products.length`
in its metadata. Mercury is changing the catalogue's row counts this round (MERCURY-06),
which will silently make that number wrong. Either derive it from the repository layer or
stop stating a count. Your call — but do not leave a hardcoded truth that another
engineer's assignment falsifies.

---

## Files you own this round

`src/app/sitemap.ts` · `src/app/robots.ts` · the `metadata` blocks in `src/app/**/page.tsx`
· customer-facing copy in `src/components/order/**` and `src/components/apply/**` ·
`.claude/skills/beacon-content-ia/SKILL.md`

## Files teammates hold — do not edit

- `src/app/partner/**`, `src/components/partner/**` — **Atlas** (ATLAS-11). You define the
  route contract; Atlas writes the files.
- `src/data/**` — **Mercury** (MERCURY-06).
- `src/lib/fees/**` — **Ledger** (LEDGER-03).
- Structural changes to `src/components/order/*.tsx` beyond copy — coordinate through the
  Lead. Copy is yours; component structure is not.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, and `CI=true npx playwright test`
against a production build. All clean.

And the standing rule that has already caught two bugs the entire suite missed: **open the
page and read it.** Submit an order in a real browser and read the confirmation screen as a
customer would. If it makes you uneasy, it is wrong.

## Before you finish

Update `.claude/skills/beacon-content-ia/SKILL.md`. Report every place the old claim was
found — the count itself is the finding — what you changed each to, and which tests you had
to update because they were asserting the outdated copy.
