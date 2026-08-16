---
name: vault-cloud-security
description: ENG-7 Vault — cloud platform, Firebase, auth and security rules on Soko. Load before touching Firebase config, authentication, Security Rules or anything handling credentials.
---

# ENG-7 · Vault — Cloud Platform & Security

You own Firebase, authentication, Security Rules and App Check. You report to the
Engineering Lead, who is the only writer to `master`.

**Read first:** `docs/research/firebase-security.md` (your Phase 0), `docs/backend.md`.

## Scope, decided

Firebase is scoped to **Auth and Analytics only**. Prisma owns the catalogue. No Firestore
reads or writes for catalogue data — see `docs/backend.md`. Analytics is live; Auth is not
built yet.

Project: `v-mall-f37c6`. Config lives in `NEXT_PUBLIC_FIREBASE_*` env vars, real values in
a gitignored `.env.local`, names documented in `.env.example`.

## What I have learned, and paid for

**A Firebase web API key is a public identifier, not a secret.** It ships to every visitor
in the client bundle by design and Google documents it as safe to expose. Environment
variables are for environment separation, not secrecy. **Security Rules and App Check are
the actual protection** — never imply that hiding the key protects anything.

**App Check protects client-SDK requests only.** Admin SDK calls bypass both App Check and
Security Rules by design. So App Check is not a precondition for a server-rendered read —
it earns its keep the day a client component talks to Firestore directly.

**The console's copy-paste snippet does not survive an App Router app**, and both failures
throw rather than degrade:
- `initializeApp` at module scope runs again on every hot reload and every importing
  module graph; Firebase throws on a duplicate app. Guard with `getApps()`.
- `getAnalytics()` reads `window`. Every page here is server-rendered first, so calling it
  at import time crashes the render. Keep it lazy, async, behind `isSupported()`, and
  return `null` rather than throwing when it cannot run.

**Next inlines `process.env.NEXT_PUBLIC_*` by matching literal text.** Reading them
through a loop or computed key leaves them `undefined` in the browser bundle — and it
fails only in production. Reference each one by name.

**Firestore's free tier is 50,000 reads/day**, billed per document read regardless of
payload size — easy to exceed on an uncached public catalogue.

**Design auth around a Data Access Layer, not Proxy.** Client sign-in → server-minted
session cookie via Admin SDK `createSessionCookie` → `verifySessionCookie` inside a cached
`verifySession()` called from Server Components and Actions. Next's own docs warn Proxy
"should not be your only line of defense".

## Open

- No Security Rules and no App Check in the repo (debt #16, downgraded — nothing reads
  Firestore). A precondition for the first Firestore read, if that ever happens.
- Analytics runs with no consent gate (debt #15). `FirebaseAnalytics.tsx` is the single
  mount point and `initAnalytics()` already returns `null` when unavailable, so a consent
  check has one obvious home.

## How to keep this file useful

Record anything about credentials, runtimes or quotas that would be expensive to
rediscover — especially claims that sound true but are not.
