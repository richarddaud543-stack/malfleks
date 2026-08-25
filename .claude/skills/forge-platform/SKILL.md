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
run `prisma generate` when types lag the schema. Prisma 7's `migrate dev` also has **no
`--skip-seed` flag** (it prints usage and exits), so reach for `--create-only` when you
need to see the SQL before it runs.

**Prisma's generated SQL for a replaced column will not populate the new one.** Swapping
`DeliveryAgent.etaEstimate` for `etaMinDays`/`etaMaxDays` produced a table rebuild whose
`INSERT ... SELECT` simply omitted both new NOT NULL columns — correct against an empty
database, a constraint violation against any real one. The fix is to hand-edit the
generated migration to translate the old values (`CASE WHEN "etaEstimate" LIKE 'Same-day%'
THEN 0 …`) before applying it. Always read `--create-only` output when a column is being
replaced rather than added; the warning block at the top tells you exactly which columns
were left unset.

**App Check protects client-SDK requests only.** Admin SDK calls bypass both it and
Security Rules, so it is not a precondition for a server-rendered read. The Firebase web
API key is a **public identifier**, not a secret; Security Rules are the protection.

**Next 16 Proxy (renamed from Middleware) defaults to the Node.js runtime**, which
removes the usual reason to reach for Edge-workaround auth libraries.

**Multi-level `onDelete` cascades actually work transitively through the
better-sqlite3 adapter** — deleting a `Branch` that cascades to `Product`
(`onDelete: Cascade`) also fires that now-deleted `Product`'s own
`onDelete: SetNull` on `Order.productId`, in one statement, no app-level
fan-out needed. Don't assume this without a test, though — I wrote one
(`create-order.test.ts`'s cascade describe block) that deletes a real seeded
branch and agent and asserts the referencing `Order` row survives with the
columns nulled and the snapshot fields untouched. That test is the actual
proof the "loose reference, `onDelete: SetNull`" design decision holds; the
schema comment is not enough on its own.

**Catching a Prisma unique-constraint violation**: `error instanceof
Prisma.PrismaClientKnownRequestError && error.code === "P2002"`, importing
`Prisma` (the namespace, not just `PrismaClient`) from `@prisma/client`. Used
this for `Order.reference`'s regenerate-and-retry-once — checking `code`
alone was enough here since `reference` is the only column in the table a
normal write could plausibly collide on (the cuid `id` isn't).

**A pure trust-boundary function used by two persistence backends should not
live inside either backend's module.** `buildOrderRequest` (re-derives an
order from the catalogue, used by both the Firestore saved-copy path and the
new Prisma `Order` table) started out in `saved-requests.ts`, which imports
`firebase-admin` at module scope. Pulling it into the Prisma-only
`create-order.ts` would have made an anonymous-checkout write path depend on
Firebase Admin being importable at all. Moved it to
`src/server/orders/build-order-request.ts` with zero Firestore/Prisma
imports; `saved-requests.ts` now re-exports it so nothing that imported it
from there before had to change.

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
