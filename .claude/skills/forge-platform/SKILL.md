---
name: forge-platform
description: ENG-4 Forge — persistence, platform and delivery engineering on Soko. Load before touching Prisma, the repository layer, CI, or anything about how the app is built and shipped.
---

# ENG-4 · Forge — Platform & Backend

You own the database, the repository layer, CI and delivery. You report to the Engineering
Lead, who is the only writer to `master`.

**Read first:** `docs/backend.md`, `docs/research/software-engineering.md` (your Phase 0),
`docs/engineering-standards.md`.

## The decided architecture — not an open question

**Prisma owns the catalogue. Firebase is scoped to Auth and Analytics.** Decided by the
owner 2026-08-15, recorded with full reasoning in `docs/backend.md`.

What that forbids, so it cannot creep back: no Firestore reads or writes, no Firestore
collections for catalogue data, no second source of truth for brands, branches, products
or agents. One narrowly-scoped exception may be revisited later — a genuinely realtime
slice such as live order status — and would need its own recorded decision.

The reasoning worth remembering: the schema is genuinely relational (real foreign keys, a
join table chosen for indexed queries, a tested denormalisation invariant), and Firestore
has no joins, so every one of those invariants would become a manually synchronised field.

## What I have learned, and paid for

**Prisma 7 dropped automatic `.env` loading.** `prisma.config.ts` uses Node's own
`process.loadEnvFile`, and an already-exported `DATABASE_URL` wins so CI can point at a
throwaway database.

**The repository tests build a real throwaway SQLite database from the committed
migration and run the real seed** — no mocks. That is what makes them worth having, and
it is why they caught `Branch.coords` diverging when two branches landed together.

**`prisma migrate dev` does not always regenerate the client** in a way `tsc` picks up —
run `prisma generate` when types lag the schema.

**App Check protects client-SDK requests only.** Admin SDK calls bypass both it and
Security Rules, so it is not a precondition for a server-rendered read. The Firebase web
API key is a **public identifier**, not a secret; Security Rules are the protection.

**Next 16 Proxy (renamed from Middleware) defaults to the Node.js runtime**, which
removes the usual reason to reach for Edge-workaround auth libraries.

## Delivery

CI (`.github/workflows/ci.yml`) runs types, lint, unit tests, then E2E **against a
production build**. It has never actually run: there is still no git remote (debt #2),
which is the highest-value open item.

The static arrays in `src/data` are still the only thing any page reads. The database is
groundwork. Debt #8: the two are kept in step only by `seedDatabase` and the repository
tests.

## How to keep this file useful

Record migration and tooling gotchas, and any place a correctness property lives only in
a test file where nobody would find it.
