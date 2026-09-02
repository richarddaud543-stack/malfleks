# PRISM-05 · Partner surface tokens, and the launch asset audit

**Assigned to** ENG-6 · Prism — Visual & Graphic Design
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 1
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

Two unrelated things, both blocking a launch.

The design system has no vocabulary for **state**. MalFleks now has orders that move through
four statuses and partners that move through three, and Atlas is about to build a partner
portal that renders all of them (ATLAS-11). Without tokens, seven status treatments get
invented ad hoc in seven components, which is exactly how a design system degrades — and
you have already seen this repo's failure mode: everyone copies whatever pattern is
present, degraded ones included.

Separately, **every brand logo on the site is a trademark MalFleks has no agreement to use.**
`SOURCES.md` flags it honestly and nobody has costed the fix.

---

## Phase 0 — Onboarding (do this first, record it)

Into `docs/research/graphic-design.md`:

1. **Status and state colour systems** — how mature design systems encode a small set of
   lifecycle states without inventing a colour per state, and specifically how they keep
   "pending" from reading as "warning" and "cancelled" from reading as "error" when they
   are neither.
2. **Trademark and press-kit usage terms** for the six brands in the catalogue: Toyota,
   Ford, BMW, Oraimo, Apple, Halotel. Find each one's actual brand/press asset page and
   its stated terms. Primary sources — the company's own brand page, not a logo
   aggregator.

---

## Phase 1 — Build

### 1. Status tokens, contrast-computed

Seven states across two lifecycles:

- Order: `pending` · `confirmed` · `cancelled` · `fulfilled`
- Partner: `applied` / `pending` · `approved` / `active` · `suspended` / `rejected`

Define them once in `src/app/globals.css`, in the existing token vocabulary. They must
survive on the mint surface, on the forest ink ground and inside a card — a badge has more
than one possible neighbour and you already know from debt #10 that a colour can pass in
one context and fail 3:1 in another. Halotel passed on the page at 3.19:1 and failed inside
its own chip at 2.75:1; that is the standing example.

Non-negotiable, from your own last round:

- **Compute the contrast, do not eyeball it.** Use `src/lib/accent.ts` and `borderAccent()`
  — the machinery exists precisely so this is not a judgement call.
- **Not directional by assumption.** On a light ground, lightening a bright accent makes it
  worse. `accent.ts` searches outward in both directions for a reason.
- Add the cases to `src/lib/accent.test.ts` — computed claims get tests, or they are just
  assertions with better prose.
- **Never encode state by colour alone.** A status badge carries its word. Colour is
  reinforcement, and a colour-blind partner reading their own order queue is a real user,
  not an edge case.

Ship these as tokens and a documented badge treatment. Atlas consumes them; you do not
build the partner components.

### 2. The launch asset audit

Write this into `src/data/SOURCES.md`, extending the section that is already there.

For each of the six brands: the official press-kit or brand-asset URL, the stated usage
terms, and a one-line verdict — can MalFleks use this mark under those terms once it is
operating commercially, or does it need a distribution agreement first?

Then the part that makes it actionable: **what changes if a brand says no.** A brand that
refuses is not a design emergency if the answer is known in advance — a wordmark set in
Bricolage, a neutral tile, a category icon. Show the fallback so the owner is choosing
between two visible options rather than between a logo and a hole.

**Swap nothing.** The current logos stay until a real agreement exists. You are costing the
change, not making it.

### 3. Product photography — end the "revisit before launch"

Debt #5 has sat as *"Deliberate. Revisit before launch."* since 2026-08-13. Launch is now
the thing being planned, so it is time for a real answer.

The current SVG icon set was a considered decision and a good one — Commons searches for
generic categories kept surfacing vintage or competitor-branded photos, and custom icons
keep every brand on equal footing inside the showcase. Say what replacing it would actually
take: a licensed stock set, a real shoot, or brand-supplied product imagery, with what each
costs in money and in time, and what it does to the showcase's visual coherence when six
brands supply photography of six different qualities.

A recommendation is welcome. The decision is the owner's.

---

## Files you own this round

`src/app/globals.css` · `src/lib/accent.ts` and `src/lib/accent.test.ts` ·
`src/data/SOURCES.md` · `docs/research/graphic-design.md` ·
`.claude/skills/prism-visual-design/SKILL.md`

## Files teammates hold — do not edit

- `src/components/partner/**` — **Atlas** (ATLAS-11). You define the tokens and the badge
  treatment; Atlas applies them.
- `src/data/branches.ts`, `src/data/delivery-agents.ts`, `src/data/products.ts` —
  **Mercury** (MERCURY-06). `SOURCES.md` is shared: you own the imagery and logo sections,
  Mercury owns the branch, courier and coordinate sections. Stay in your sections; you will
  both be in that file this round.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `CI=true npx playwright test` against
a production build. All clean.

And open the page. Every token you add should be visible somewhere before you call it done.

## Before you finish

Update `.claude/skills/prism-visual-design/SKILL.md` with the measured ratios — a number
you actually computed is worth more than "check contrast", and that is the standing rule
for these files. Report what you changed, what you deliberately did not, and your
verification output.
