# SENTINEL-07 · Prove the money and the authorization

**Assigned to** ENG-3 · Sentinel — QA, testing, accessibility
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 3 — **lands last**
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

This round adds a pure money module, a partner portal, a publish flow and a partner-scoped
order query. Two of those are the kind of code where a bug is not a bug but an incident:
**arithmetic about money, and authorization between partners who are commercial rivals.**

Your job is not to add coverage. It is to find out whether the coverage that exists would
actually catch a wrong implementation — which is debt #11, open since 2026-08-14, and now
finally worth doing because there is something worth pointing it at.

---

## Wait for the round

You land last. FORGE-09, LEDGER-03, VAULT-05, MERCURY-06, BEACON-04, PRISM-05 and ATLAS-11
should all be on `master` before you start. If some have not landed, test what is there and
say plainly in your report what you could not reach — a suite that claims coverage it does
not have is worse than a smaller honest one, and that is your standing principle.

---

## Phase 0 — Onboarding (do this first, record it)

Into `docs/research/qa-and-accessibility.md`:

1. **Mutation testing for TypeScript with Vitest in 2026.** Stryker is the obvious
   candidate — confirm it still is, confirm the Vitest runner is current, and find out what
   it costs in wall-clock on a suite this size. If it is not viable, say so with the
   evidence; a well-argued "no" closes debt #11 as decisively as a yes.
2. **Playwright authorization testing patterns** — specifically, testing that user A
   *cannot* see user B's data, with two authenticated sessions in one spec.

---

## Phase 1 — Build

### 1. Mutation testing, scoped to what matters (debt #11)

The register says scope it to `src/server` and `src/lib` and sequence it after debt #2.
Debt #2 is still open, so this runs locally, by hand, and reports a number — that is fine
and it is worth doing now anyway.

Narrow it further than the register says, to the two places a surviving mutant is
genuinely expensive:

- **`src/lib/fees/**`** — Ledger's module. Every mutant here is a wrong amount of money.
- **`src/server/orders/status.ts`** — the transition guard. A surviving mutant here is an
  illegal state transition nobody notices.

Report the mutation score for each and, more usefully, **name the surviving mutants that
represent real gaps.** Do not chase 100%; an equivalent mutant is not a defect and
pretending otherwise turns the number into theatre. Where a survivor is real, write the
test that kills it.

This is the structural answer to an agent writing a test that trivially passes against the
code it just wrote — which is the actual risk model of this team, so frame your findings
that way.

### 2. Authorization E2E, both directions

The highest-stakes property in the whole partner surface: **a branch must not see another
branch's orders, and a courier must not see any branch's.** These are competing businesses.

Test it in both directions, and use the discipline this repo has already established for
security work — **inject the mistake and watch the suite fail before you trust the pass.**
That is how the Firestore rules suite was validated (13 assertions, both classic mistakes
injected) and it is the only thing that distinguishes a real authorization test from one
that would pass against no authorization at all.

Cover at least:

- Branch A signed in, requesting an order belonging to Branch B — by direct URL, not just
  by what the UI links to.
- A courier requesting a branch's order.
- A partner whose status is `suspended`.
- A signed-in customer with no partner record at all reaching `/partner`.
- A non-admin reaching `/admin` and `/admin/orders`.

### 3. The full lifecycle, end to end

One spec that walks the whole loop, because every piece of it is new and nobody has ever
seen them work together:

apply → admin approves → admin links the partner to a branch → branch submits a product →
admin publishes → the product appears to a customer → customer orders → admin confirms →
admin fulfils.

Then assert the negative that matters most: **the order's `OrderEvent` history matches the
transitions that actually happened**, and an illegal transition is rejected rather than
silently ignored.

### 4. Accessibility on the new surfaces

The partner portal is a table of records with status badges — the most common place a
keyboard user gets stranded. Real labels, keyboard operation, announced errors, the global
`:focus-visible` ring intact. And confirm Prism's status treatments never encode state by
colour alone; every badge carries its word.

Accessibility is part of done, not a follow-up.

### 5. Guard the copy Beacon fixed

Beacon corrected customer-facing copy this round that had gone false — the order flow
telling customers their request goes nowhere when it is now written to the database
(BEACON-04). Add an assertion that pins the corrected claims, so the next change to that
flow has to confront them deliberately rather than drift past them.

Equally, assert the negative: **no customer-facing surface displays a deposit amount or
implies a payment.** Ledger's fee module exists now, and it is barred from customer
surfaces this round. Make that a test, not a policy.

---

## Files you own this round

`e2e/**` · `vitest.config.mts` · `vitest.rules.config.mts` · the Stryker config ·
`playwright.config.ts` · `.claude/skills/sentinel-qa/SKILL.md` ·
`docs/research/qa-and-accessibility.md`

You may add test files anywhere. **You may not change non-test source to make a test
pass** — if a test fails because the code is wrong, that is a finding: report it to the
Lead with the failing case, and let the owning engineer fix it. A QA engineer who edits the
implementation is no longer a second pair of eyes.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run test:rules` against the
emulator, and `CI=true npx playwright test` against a production build. All clean.

E2E runs against a production build, never `next dev` — dev compiles per request and times
specs out under parallel workers. That one is already in your skill file; it stays true.

## Before you finish

Update `.claude/skills/sentinel-qa/SKILL.md` with any new flake and its diagnosis, and with
the mutation-testing result — whether it earned its place or not.

Report the mutation scores, every surviving mutant you judged real, every authorization
case, and **anything you found that you did not fix because it was not yours to fix.** That
list is the most valuable part of your report.
