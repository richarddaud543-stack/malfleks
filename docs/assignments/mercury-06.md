# MERCURY-06 · Make the catalogue real

**Assigned to** ENG-2 · Mercury — Data & Business Logic
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 2 — **land after FORGE-09**
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

Soko cannot go live on invented data, and right now **7 of 19 branches and 3 of 5 couriers
are `verified: false`** — plausible cities and addresses that nobody confirmed. Every branch
in a city shares one approximate city-centre coordinate, so the locator map points at the
middle of town rather than at a shop.

This is the assignment where the catalogue stops being a prototype. It is mostly research,
and the research standard is the whole job.

---

## The rule that governs this entire assignment

**Never let invented data claim `verified: true`.** It is in the standing engineering
baseline, it is why the flag exists, and it is the one thing here that cannot be undone
quietly — a false `verified` flag propagates into the trust badges customers rely on.

Three outcomes are acceptable for a `verified: false` record. Promotion is only one of
them:

1. **Promote** — you found the real branch on a primary source. Set `verified: true`,
   correct the address to the confirmed one, and log the source in `SOURCES.md`.
2. **Replace** — the record is fictional but a real branch of that brand exists in that
   city. Replace it wholesale with the real one and promote.
3. **Delete** — no real branch of that brand exists in that city. Remove the record.

A smaller, true catalogue beats a fuller, false one. Deleting rows is a success, not a
shortfall, and you should expect to delete some.

---

## Phase 0 — Onboarding (do this first, record it)

This *is* most of the assignment. Record what you find, with links, in
`docs/research/data-and-domain.md`.

For each of the six brands, find the official dealer, branch or reseller locator and work
out what actually exists in Dar es Salaam, Arusha, Mwanza and Dodoma:

- **Toyota** — the official Tanzania distributor and its branch network.
- **Ford** — the regional distributor and any Tanzanian presence.
- **BMW** — the authorised dealer, if any.
- **Oraimo** — its Tanzania retail and service presence.
- **Apple** — this is the sharpest one. There is no Apple Store in Tanzania; there are
  authorised resellers. If none can be confirmed, the honest outcome may be deleting
  Apple's branches, and that is a legitimate finding rather than a failed search.
- **Halotel** — a Tanzanian operator, so its shop list should be the most findable of the
  six. Get the real ones.

Then the couriers: which delivery companies actually operate in those four cities, with a
findable business presence.

**Primary sources only** — the company's own site, its own locator, its own contact page.
Not a directory aggregator, not a maps listing with no corroboration, and never an address
that appears in exactly one place you cannot verify. If you cannot confirm it, it is not
verified. Say so and move on; an admitted gap is worth more than a smoothed-over guess.

---

## Phase 1 — Build

### 1. Apply the research to `src/data`

Work through `src/data/branches.ts` and `src/data/delivery-agents.ts` record by record,
applying outcome 1, 2 or 3 to every `verified: false` row. Also **re-check the rows already
marked `verified: true`** — they were confirmed in mid-August against sources that may have
moved, and a stale `true` is more dangerous than a `false`.

### 2. Geocode what you promoted

Every branch that becomes `verified: true` with a real street address gets its **real
coordinates**, replacing the shared `cityCoords` entry. Keep `cityCoords` for anything that
legitimately remains city-level.

Then update the coordinate section of `SOURCES.md` so it stops describing a uniform
approximation that is no longer uniform: say which branches carry surveyed positions and
which are still city-centre. The current text is careful and correct about today; make it
careful and correct about tomorrow.

Note the precedent: adding city-centre coordinates deliberately did **not** flip anyone's
`verified` flag, because knowing which city a branch is in is not the same as having
confirmed its address. Real coordinates for a confirmed address are a different thing —
but the flag follows the *address* confirmation, not the coordinate.

### 3. Recommend the four delivery fees — for Ledger

Ledger is building the fee module this round (LEDGER-03) and its per-city delivery fee
table has four entries with no numbers in them. `docs/marketplace-model.md` decides that
Soko sets these, but not what they are.

From your courier research, recommend a number for Dar es Salaam, Arusha, Mwanza and
Dodoma, each with a stated basis — what couriers in that city actually charge for a
comparable hop. **Mark all four directional.** They are the owner's to set; you are giving
them something real to react to instead of a blank field.

Put this in your report and in `docs/research/data-and-domain.md`. Do not write them into
Ledger's table yourself.

### 4. Keep the seam intact

Changing row counts is the part of this assignment most likely to break something
elsewhere. `src/data` is still the editorial source and the seed mirrors it; `parity.test.ts`
compares record for record, and it exists because exactly this seam silently diverged once
before when two branches landed together.

- Update the seed and the parity fixtures to match your new counts.
- `src/components/locator/locator.fixture.ts` and the locator tests assume specific
  records — check them.
- Beacon is separately handling the catalogue count in `/search` metadata (BEACON-04), so
  leave that to them.
- If a product's branch is deleted, its product goes with it. Follow the chain.

---

## Files you own this round

`src/data/branches.ts` · `src/data/delivery-agents.ts` · `src/data/products.ts` ·
`src/data/index.ts` · the branch, courier and coordinate sections of `src/data/SOURCES.md`
· `docs/research/data-and-domain.md` · `.claude/skills/mercury-data-domain/SKILL.md`

## Files teammates hold — do not edit

- `prisma/**` and `src/server/db/seed.ts` — **Forge** (FORGE-09), landing before you. You
  will need the seed to match your counts: make the minimal change and flag it in your
  report so the Lead can check it against Forge's work.
- `src/lib/fees/**` — **Ledger**. Recommend the numbers; do not write them.
- The imagery and logo sections of `SOURCES.md` — **Prism** (PRISM-05). You will both be
  in that file; stay in your sections.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `CI=true npx playwright test` against
a production build. All clean — the repository and parity suites especially, since they are
what this assignment is most likely to break.

Then open `/locator` and look at the map. If a marker sits somewhere a shop is not, that is
the defect this assignment exists to fix.

## Before you finish

Update `.claude/skills/mercury-data-domain/SKILL.md` with what you learned about sourcing
Tanzanian retail data — which sources were reliable, which looked authoritative and were
not. That is expensive knowledge to buy twice.

Report the counts: how many promoted, how many replaced, how many deleted, and the final
verified ratio. **A deletion is a result. Report it as one.**
