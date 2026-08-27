# LEDGER-03 · The fee module, as data

**Assigned to** ENG-8 · Ledger — Commerce & Payments
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 1
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

`docs/marketplace-model.md` contains a complete, decided pricing model — two ladders and a
per-city delivery fee — and not one line of it exists in code. It has already changed twice
in one conversation, which is the whole argument for what this assignment builds: **both
ladders as data a non-engineer can edit, behind a pure function nobody has to trust twice.**

You are building the *arithmetic*, not the payments. Read the boundary in "Not in scope"
before you start; it is the most important paragraph in this brief.

---

## Phase 0 — Onboarding (do this first, record it)

Your research file is `docs/research/commerce-and-payments.md`, written 2026-08-15. Two
weeks is long enough for a regulator's page to move. Re-verify against primary sources and
update it in place, marking what you confirmed and when:

1. **The Bank of Tanzania position.** The model rests on Soko being a merchant of a
   licensed aggregator rather than a payment operator, read from the National Payment
   Systems Act. Re-read the statute text or the BOT's own page. If the reading has
   weakened, that is the single most important thing you could report this round.
2. **Selcom and Azampay** — current merchant onboarding requirements, what a merchant
   actually has to be (registered company? TIN? bank account?), and the shape of their
   collection API. The owner will have to act on this; make it concrete enough to act on.
3. **Whether either aggregator imposes a fee floor or a minimum transaction size.** This
   bears directly on the open 25% bottom-rung question — if the aggregator itself charges
   more than 500 TZS to collect 500 TZS, the bottom rung is not a policy question, it is
   an arithmetic one, and the owner needs to know that.

Cite primary sources. Mark everything else directional. An admitted gap is worth more than
a smoothed-over guess.

---

## Phase 1 — Build

### The shape

```
src/lib/fees/
  tables.ts   — pure data. The two ladders, the four city delivery fees. No logic.
  index.ts    — pure function. No I/O, no Prisma, no Firebase, no imports from src/server.
  fees.test.ts
```

`quoteOrder({ goodsTotalTZS, city, routeKind })` → `{ goodsRung, deliveryFee,
deliveryRung, deposit, branchPayout, courierPayout, sokoEarns }`. Integer TZS throughout —
never float, never `Decimal`. The schema already says `priceTZS Int` and the reason is in
`docs/backend.md`.

Model it on `buildListings` / `previewDelivery`: the pure half is the part worth trusting,
and it is the part you can test exhaustively.

### The tables — copy them exactly

From `docs/marketplace-model.md` §2. Both ladders, verbatim, including the 40,000 cap.
Do not round, re-derive or "improve" a number. If you believe one is wrong, report it;
do not fix it in the table.

The four per-city delivery fees (Dar es Salaam, Arusha, Mwanza, Dodoma) **do not exist
yet**. Mercury is researching what couriers actually charge in each city (MERCURY-06) and
will hand you a directional recommendation. Until then, ship the table with the four
entries present and explicitly marked as unset placeholders, and make
`assertTablesCoherent()` fail loudly if a quote is requested against an unset city rather
than silently returning zero. **A zero here would look like free delivery.**

### The open decisions become configuration, with a stated default

Each of these is the owner's, and each ships with a default marked in the table so nothing
waits on a decision. Tag each one `OWNER_DEFAULT` with a comment pointing at the line in
`docs/marketplace-model.md` it came from:

| Question | Default this ships with |
|---|---|
| The 25% bottom rung | As written — 500 on a 2,000 item. No minimum order value. |
| Deposit on a brand-fleet order | Goods rung only, no delivery rung. Soko earns nothing on that leg. |
| Weight or size surcharge | None. `Product` cannot carry weight yet. |
| The superseded 1,000 TZS off-platform fee | Gone, per §2. Not reinstated as a penalty. |

Do not invent a number that is not in the document. A number invented by an engineer reads
as policy to whoever finds it next.

### `assertTablesCoherent()`

A single exported check, run in tests and callable at startup, that fails if the ladder
bands overlap, leave a gap, are unsorted, or if a city fee is unset. These tables will be
edited by someone who is not an engineer — that is the point of them being data — so the
guard rail is the feature, not the ceremony.

### The tests are the deliverable

- Every **band edge**, both sides: 5,000 vs 5,100 must differ; 100,000,000 vs
  100,000,001 must not.
- **Reconciliation, as a property, across the whole real catalogue** — all 38 products ×
  4 cities × both route kinds:
  - `deposit + doorPayment === orderTotal`
  - `branchPayout + courierPayout === doorPayment`
  Exactly. No tolerance, no rounding slack. The three worked examples in §2 reconcile to
  the shilling and yours must too.
- The three worked rows from §2 (earbuds 6,500 · fridge 20,500 · SUV 42,500) asserted
  literally, as a canary on the tables.
- A brand-fleet quote yields **no** courier payout and **no** delivery rung.
- `assertTablesCoherent()` fails on a deliberately corrupted table — inject the mistake,
  watch it fail, then restore. Sentinel will mutation-test this module (SENTINEL-07);
  write tests that would survive that.

---

## Files you own this round

`src/lib/fees/**` · `docs/research/commerce-and-payments.md` ·
`.claude/skills/ledger-commerce/SKILL.md`

## Files teammates hold — do not edit

`src/lib/order.ts` and `src/data/**` are **Mercury**'s. `src/server/**` is **Forge**'s.
Your module imports from neither — that is deliberate, and it is what makes it testable.

## Not in scope — read this twice

- **No payment integration.** No aggregator SDK, no HTTP client, no webhook handler.
- **Never handle a real merchant key, API secret or credential.** Those are the owner's to
  place directly. You design the integration; you do not hold the keys.
- **Nothing you build may make an order look paid.** Soko still takes no money. The order
  flow produces a *request*, and the copy says so plainly. Those statements are
  load-bearing — Beacon is auditing them this same round (BEACON-04). Your module computes
  what a deposit *would* be; it must not be wired into any page that a customer sees, and
  no UI in this round displays a deposit amount to a customer.
- Do not run any git command that changes state.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`. All clean.

## Before you finish

Update `.claude/skills/ledger-commerce/SKILL.md`, separating what you verified against a
primary source this round from what remains secondary. Report your recommendation on the
bottom rung given what Phase 0 turned up about aggregator floors, the sequencing you would
follow into Stage 3, and everything you could not verify.
