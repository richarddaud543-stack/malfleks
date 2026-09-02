# VAULT-05 · Rate limit, retention mechanism, and the enforcement runbook

**Assigned to** ENG-7 · Vault — Cloud Platform & Security
**Assigned by** the Engineering Lead, 2026-08-27
**Round** 2026-08-27 · go-live · wave 1
**Status** not started

You start this assignment cold. Everything you need is below or named below.

---

## Why you have this

Three of your rows in the debt register are half-done or open, and all three are things a
live platform cannot ship without. Debt #21 (no rate limit) is a real quota exposure. Debt
#20's retention *mechanism* does not exist even though the delete path does. And App Check
enforcement is a console click nobody has written down how to make safely.

Also: your own agent definition is now wrong, and you are the one who should fix it.

---

## Phase 0 — Onboarding (do this first, record it)

Into `docs/research/firebase-security.md`, primary sources:

1. **Firestore TTL policies** — how they are declared, their actual deletion latency
   (it is not immediate and the number matters for a stated retention promise), and
   whether they can target a subcollection like `customers/{uid}/orderRequests`.
2. **App Check enforcement rollout** — Google's current recommended sequence, what the
   monitor-only metrics actually show, how long to watch, and how to roll back if
   legitimate traffic starts failing.
3. **Per-uid rate limiting in a Next.js server action with no Redis.** MalFleks has one
   SQLite/Postgres database and Firestore. What is the honest option set, and what does
   each cost? Be sceptical of anything in-memory: it does not survive a serverless cold
   start, and claiming it rate-limits anything would be exactly the kind of overstated
   security this role exists to prevent.

---

## Phase 1 — Build

### 1. The per-uid rate limit (debt #21)

`MAX_SAVED_REQUESTS_PER_CUSTOMER = 200` bounds total damage, not burst rate. Firestore's
free tier is 20,000 writes/day for the whole project, so one signed-in customer can still
burn the project's day.

Apply a real per-uid limit to the three write paths:

- `saveOrderRequest` / `deleteOrderRequest` (`src/app/actions/order-requests.ts`)
- `submitOrder` (`src/app/actions/orders.ts`)
- `submitPartnerApplication` (`src/app/actions/partner-applications.ts`)

Enforced **server-side, in the action path, before the write** — never in the component.
A signed-out customer has no uid; rate-limit those too, on whatever signal you honestly
can, and state plainly in your report what that does and does not protect against. If the
honest answer is "nothing reliable without App Check enforcement", say that — it is true
and it strengthens the case for item 3.

Test the limit trips, and test it releases.

### 2. The retention mechanism, built to a number the owner supplies (debt #20)

The retention *policy* is the owner's call and stays open. The *mechanism* is yours and
should not wait for it. This is the pattern this whole round uses: build the machine,
leave the number as configuration.

- A single configuration point — `RETENTION_DAYS` — with a documented default of
  `null`, meaning **never expires**, which is exactly today's behaviour. Nothing changes
  until the owner sets a number.
- The purge function itself: expire saved requests older than `RETENTION_DAYS`. Through
  the Admin SDK, like every other write — `firestore.rules` keeps denying client writes
  and must not change.
- An account-closure purge: given a uid, remove that customer's `orderRequests`
  subcollection. Note in your report whether this should also fire on Firebase Auth user
  deletion, and what would have to exist for that to be automatic.
- Tested against the emulator, both directions: a record inside the window survives, a
  record outside it does not.
- Document in `docs/auth.md` what the owner is actually choosing between, with the TTL
  latency number from Phase 0, so the decision can be made from the page.

**Do not pick the number.** A number invented here would read as policy to whoever found
it next — that reasoning is already written into the debt register and it still holds.

### 3. The App Check enforcement runbook (debt #16)

App Check is wired with reCAPTCHA v3 and enforcement has never been turned on. That is
correct — Google's guidance is monitor-only first — but "turn it on eventually" is not a
plan anyone can execute.

Write the runbook into `docs/auth.md`:

- The exact console path, product by product (Firestore and Auth are separate switches).
- What to look at in monitor-only metrics before flipping, and what a healthy ratio looks
  like versus one that says real users would be locked out.
- How long to watch.
- The rollback, and how fast it takes effect.
- The debug-token caveat for localhost and CI, and why that token belongs only in
  `.env.local` — a debug token in the repo lets anyone mint valid App Check tokens, which
  is the one thing App Check exists to prevent.

It stays a click only the owner can make. Your job is that the click is safe and
reversible when they make it.

### 4. Correct your own agent definition

`.claude/agents/vault.md` says *"Analytics is live, Auth is not built yet."* Auth shipped
2026-08-16 and the consent gate shipped 2026-08-17. A cold engineer reading that brief is
being told something false about the repo they are about to change. Fix it, and while you
are there, check the rest of that file against what is actually true today.

---

## Files you own this round

`src/server/auth/**` · `src/app/actions/order-requests.ts` · `firestore.rules` ·
`docs/auth.md` · `docs/research/firebase-security.md` · `.claude/agents/vault.md` ·
`.claude/skills/vault-cloud-security/SKILL.md`

## Files teammates hold — do not edit

- `src/server/orders/**`, `src/server/partners/**`, `prisma/**` — **Forge** (FORGE-09),
  landing in parallel. You will both need to touch `src/app/actions/orders.ts`: you add
  the rate-limit guard, Forge does not touch that file this round, so it is yours.
- `src/lib/fees/**` — **Ledger**.

## Verification before hand-off

`npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run test:rules` against the real
emulator, and `CI=true npx playwright test` against a production build. All clean.

If `firestore.rules` ends up unchanged — which is the likely and correct outcome, since
every write goes through the Admin SDK — say so explicitly rather than leaving it
ambiguous.

## Before you finish

Update `.claude/skills/vault-cloud-security/SKILL.md` with anything about quotas,
runtimes or credentials that would be expensive to rediscover, especially claims that
sound true and are not. Report what you changed, what remains open, and your verification
output.

## Not in scope

Do not turn on App Check enforcement — you cannot, and neither can the Lead. Do not touch
a real credential or ask anyone to paste one. Do not run any git command that changes
state.
