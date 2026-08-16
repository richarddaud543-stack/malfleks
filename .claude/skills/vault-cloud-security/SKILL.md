---
name: vault-cloud-security
description: ENG-7 Vault — cloud platform, Firebase, auth and security rules on Soko. Load before touching Firebase config, authentication, Security Rules or anything handling credentials.
---

# ENG-7 · Vault — Cloud Platform & Security

You own Firebase, authentication, Security Rules and App Check. You report to the
Engineering Lead, who is the only writer to `master`.

**Read first:** `docs/research/firebase-security.md` (your Phase 0), `docs/backend.md`.

## Scope, decided

Firebase is scoped to **Auth and Analytics**, plus **one** Firestore collection:
`customers/{uid}/orderRequests/{autoId}`, a signed-in customer's saved order requests
(decided 2026-08-16, recorded in `docs/backend.md` under the original decision).
Prisma owns the catalogue and that has not changed — no Firestore reads or writes for
brands, branches, products or agents, ever.

Analytics is live. **Auth is built** — `docs/auth.md` is the architecture and the
operator runbook; read it before touching any of this.

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
"should not be your only line of defense". Built in `src/server/auth/dal.ts`.

**`auth_time` is in SECONDS.** Treating it as milliseconds makes every fresh sign-in look
decades old and refuses all of them. Guarded by a test in `session.test.ts`.

**Set `inMemoryPersistence` on the client Auth instance, and sign the client SDK out
after handing over the ID token.** Firebase's default keeps a long-lived session in
IndexedDB, which gives the app two answers to "who is signed in" that drift the moment a
cookie expires or is revoked. The cookie is the authority; leave exactly one answer.

**Never `await cookies()` in the root layout of a mostly-static site.** It makes every
prerendered route dynamic — 114 of them here. Put the session behind a `no-store` route
handler and let the two client components that care fetch it.

**A route that reads the session can still prerender as static** if the session check
short-circuits before touching cookies (e.g. `isAdminConfigured()` false at build time).
The build then bakes in the signed-out redirect permanently and looks healthy. Put
`export const dynamic = "force-dynamic"` on private pages and **read the ○/●/ƒ column in
`npm run build`** — no test catches this.

**Firestore ownership belongs in the path, not a field.** `customers/{uid}/…` compared
against `request.auth.uid` cannot be spoofed by the write that creates the document, and
it makes `list` inherently scoped. It also means a **collection-group query** is the
bypass to test for: it addresses every same-named subcollection under a *different* match
path, so it is denied only as long as nobody adds a helpful `/{path=**}/…` rule.

**Rules tests need Java** (the Firestore emulator is a JVM process). Keep them out of
`npm test` — otherwise every Java-less machine fails and someone "fixes" it by making the
suite skip, and a security suite that skips still shows green. Separate config
(`vitest.rules.config.mts`), separate CI job with a pinned JDK, and **fail loudly** when
the emulator is unreachable. `firebase-tools` is invoked via `npx --yes firebase-tools@14`
rather than added as a devDependency, so nobody pays a ~50MB install to run `npm test`.
Verify rules by **injecting the mistake and watching the suite fail**, not by watching it
pass.

**Tanzania: Google sign-in, not phone — for now.** Phone auth needs Blaze billing *and*
an SMS region allowlist (the policy defaults to allowing **no** regions on new projects),
bills per message sent including unentered codes, and makes a public button into
attacker-controlled spend (SMS pumping). 90.59% of TZ mobile browsing is Android
(Statcounter, July 2026). Revisit when payment lands — mobile-money identity is the
MSISDN — and note Google shipped **Firebase Phone Number Verification** (May 2026),
carrier-SIM based, no OTP, no per-message fee. Keep everything past `getIdToken()`
provider-agnostic so this is a new button, not a rewrite.

**Use `signInWithPopup`, not `signInWithRedirect`.** The redirect flow depends on
third-party storage on `*.firebaseapp.com`, which Chrome, Safari and Firefox all block
now; Firebase's own guidance is popup unless you serve from your Firebase Hosting domain.

**The "Cross-Origin-Opener-Policy would block the window.closed call" console error
during sign-in is upstream and unfixable from our side.** `accounts.google.com` sends
`COOP: same-origin` itself, severing the opener; no header we set overrides a header on
their document. Setting `same-origin-allow-popups` on `/sign-in` was tried and does not
silence it. Cancellation is still detected. Do not spend an afternoon on it again.

## Open

- **PII at rest** (debt #20). Saved requests hold name, phone and delivery address —
  Soko's first stored customer PII. No retention policy, and rules forbid client deletes,
  so a customer cannot remove their own record. Needs a decision, not just a rule change.
- **No rate limit on the save action** (debt #21). There is a 200-per-customer ceiling
  via one aggregation read, which bounds total damage but not burst. Free tier is 20,000
  writes/day project-wide.
- **App Check is wired but not enforced.** Enforcement is a console switch and Google
  says monitor-only first. Until it is on, App Check is protecting nothing.
- **The server half is unverified against a live project.** No service-account key exists
  locally, so `createSessionCookie`, `verifySessionCookie` and the Firestore write have
  never run against real credentials — only against the emulator. Largest untested seam.
- Analytics runs with no consent gate (debt #15). `FirebaseAnalytics.tsx` is the single
  mount point and `initAnalytics()` already returns `null` when unavailable, so a consent
  check has one obvious home. Note it POSTs to `firebaseinstallations.googleapis.com` on
  load, which shows up in any "nothing was transmitted" network assertion.

## How to keep this file useful

Record anything about credentials, runtimes or quotas that would be expensive to
rediscover — especially claims that sound true but are not.
