# ATLAS-11 · The partner portal, and the publish flow

**Assigned to** ENG-1 · Atlas — Frontend & Motion
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 2 — **blocked on FORGE-09**
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

`docs/marketplace-model.md` Stage 2 is the owner's stated first priority, and it is the
half of Soko that has no interface at all. A partner can apply and an admin can approve
them — and then nothing. There is no page a branch can log into, no way to submit a
product, and no way for an admin to publish one.

This assignment builds that surface. It is the last structural gap before the money.

---

## Blocked on FORGE-09

Forge is building `ProductSubmission`, the partner→catalogue link and the partner-scoped
order query. **Do not start until FORGE-09 has landed on `master`.** If you find yourself
inventing a server function, stop and report it — that is the seam damage this project
already learned to watch for, and it does not show up inside the branch that causes it.

You will also consume:

- **Prism's status tokens** (PRISM-05) for the seven order and partner states. They land in
  `src/app/globals.css` in wave 1. Use them; do not invent a badge colour.
- **Beacon's route contract** (BEACON-04) — Beacon decides whether the partner surface is
  `/partner/orders` + `/partner/products` or one page with tabs, and owns the metadata and
  `noindex` treatment. Build what they specified.

---

## Phase 0 — Onboarding (do this first, record it)

Into your research file, primary sources:

1. **Next.js 16 App Router authorization patterns for a role-gated section.** The repo has
   already rejected proxy-as-the-only-defence and put authorization in the DAL — read
   `docs/auth.md`'s "A Data Access Layer, not a proxy" section before you write a line, and
   confirm that reasoning still matches current Next guidance.
2. **Accessible data tables and status badges** — the partner order queue is a table of
   records with states, which is the most common place a keyboard user gets stranded.

---

## Phase 1 — Build

### 1. `/partner` — what a partner sees

Two audiences, one route group, gated on the partner's `kind`:

**A branch** sees its own orders — the records Forge's partner-scoped query returns.
Product, customer name, quantity, the route, the status, and when it was requested.

**A courier** sees its deliveries and its outstanding balance. The balance number comes
from Ledger's `src/lib/fees` module (LEDGER-03) — that is what it is for. If Ledger's
per-city table is still unset when you build this, the balance must render as *unavailable*,
never as `0`. **A zero would read as "you owe nothing", which is a false statement about
money.**

Non-negotiable:

- **Server components reading through the DAL.** Authorization lives in
  `src/server/auth/dal.ts`, next to the data — never in the component, never in a proxy.
- **A partner may never load another partner's rows**, not even to filter them out in the
  browser. The scoping is in the query. Sentinel will test this in both directions
  (SENTINEL-07) by injecting the mistake and watching the suite fail.
- Follow the shape of `ApplicationReviewCard.tsx` and `OrderCard.tsx` — those patterns are
  reviewed and tested, and the standing risk in this repo is that everyone copies whatever
  is already present, degraded ones included. Copy the good ones deliberately.

### 2. `/partner/products` — a branch submits

A form that writes a `ProductSubmission` through Forge's server function. Name, category,
price in whole TZS, description, specs.

The `branchId` is **derived from the session's partner on the server, never taken from the
form**. That is the same trust boundary `buildOrderRequest` enforces: the browser says what
it wants, not who it is. Do not put a branch selector in the UI.

Submission tells the truth about what happens next: it goes to a review queue, and it is
not visible to customers until an admin publishes it.

### 3. `/admin` — the publish queue

Extend the existing admin surface with a submission review queue, built to match the
partner-application review flow already there.

The one thing that must be right: **publishing is guarded and idempotent in the UI as well
as the server.** Forge makes the database reject a double-publish; your job is that two
admin tabs racing a Publish click produce one published product and a clear message, not
two rows or a stack trace. That race is not hypothetical — it was found in real code on
2026-08-23 and fixed once already.

### 4. Motion

Almost none. This is an operational surface, not the home page. Whatever you add respects
`prefers-reduced-motion`, and if you use a view transition remember the reduced-motion
guard has to be in `globals.css` — those pseudo-elements run outside React where
`useReducedMotion()` cannot see them. That one has caught you before.

---

## Files you own this round

`src/app/partner/**` · `src/components/partner/**` · `src/app/admin/**` ·
`src/components/admin/**` · `.claude/skills/atlas-frontend-3d/SKILL.md`

## Files teammates hold — do not edit

- `src/server/**` and `prisma/**` — **Forge**. If you need a server function that does not
  exist, report it; do not write it.
- `src/app/globals.css` — **Prism**. Consume the tokens; do not add one.
- `src/app/sitemap.ts`, `src/app/robots.ts` and the `metadata` blocks — **Beacon**.
- `src/lib/fees/**` — **Ledger**. Call it; do not change it.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `CI=true npx playwright test` against
a production build. All clean. E2E against a production build, not `next dev` — dev
compiles per request and times specs out under parallel workers.

Then the standing rule, which has already caught two bugs the entire suite missed: **open
the pages and use them.** Sign in, submit a product, publish it, and watch it appear to a
customer. If you cannot do that end to end by hand, it is not done.

## Before you finish

Update `.claude/skills/atlas-frontend-3d/SKILL.md`. Report what you built, what you
deliberately did not, anything you needed from Forge that was missing, and your verification
output.

## Not in scope

No payment UI. No deposit amount displayed to anyone. Do not run any git command that
changes state.
