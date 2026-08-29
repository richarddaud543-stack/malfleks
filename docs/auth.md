# Authentication and saved order requests

Rewritten 2026-08-28, when Soko moved off Firebase and onto Supabase Auth.

Two things are documented here: **who a visitor is**, and **the one thing being
signed in currently buys them** — a copy of their order request that outlives
the browser tab.

Everything else on this site works signed out, on purpose. The catalogue,
search, the branch locator and the whole order flow have never required an
account and still do not. If the auth configuration is missing entirely, that
is a supported state: sign-in reports itself unavailable, `/account` and
`/admin` are unreachable, and the shop is unaffected.

---

## Why this scope, and not a sign-in shell

An account that does nothing is worse than no account: it asks for something and
returns nothing, and it accumulates personal data with no purpose to justify
holding it. So sign-in shipped attached to the one feature that needs it. An
order request is otherwise held in the browser tab and dies with it; signed in,
it is kept, and the customer can find the reference days later and quote it to
the branch.

That is also the whole of what it does. Soko takes no payment, and being signed
in does not change what is transmitted to a branch — which today is nothing.

---

## Decision: Google sign-in, not phone

This is the decision most likely to be questioned, because Tanzania is a
phone-first market and mobile money runs on MSISDN. The evidence went the other
way for *this* feature, at *this* stage. **The move to Supabase did not change
the reasoning** — the cost structure it rests on belongs to SMS itself, not to
whoever resells it.

### The case against phone auth today

**SMS is metered spend an attacker controls.** Supabase does not send SMS
itself; it fronts Twilio, MessageBird, Vonage or a similar provider, and you
open the account and pay per message — including every code nobody ever types.
SMS pumping, where a bot drives verification requests toward numbers in
expensive ranges, is the well-known abuse of exactly this endpoint shape. Rate
limits and CAPTCHA contain it; they do not remove it. OAuth has no per-use cost
and therefore no abuse-driven bill.

Under Firebase the same argument had sharper edges — the Blaze plan was required
before a single verification SMS could be sent, and Google's SMS region policy
defaulted new projects to allowing *no* regions, so a phone button would have
failed for every visitor until someone added TZ. Those specific obstacles left
with Firebase. The cost shape did not.

**The order form already collects and validates a Tanzanian mobile number.**
`normalizePhone()` in `src/lib/order.ts` accepts `+255`/`0` prefixes and nine
digits starting 6 or 7. Phone auth would make a customer prove a number twice,
and would conflate two genuinely different things: *the number the driver
calls* and *the number that owns the account*. Someone ordering a fridge for
their mother needs those to differ.

### The case for Google sign-in

**90.59% of mobile browsing in Tanzania is Android** (Statcounter, July 2026;
iOS 9.13%). An Android phone is set up with a Google account. The population
statistic that argues for phone — smartphone penetration is 44.74% against 167%
telecom penetration (TCRA, June 2026) — is real, and it is the right argument
for a USSD or SMS product. It is not an argument about the addressable audience
for a 3D Next.js marketplace, because everyone who reaches this site is already
on a browser on a smartphone.

**It costs nothing and needs no third-party account.** Supabase's Google
provider needs a Google Cloud OAuth client and nothing else.

### Where this decision expires

**When Soko takes money, phone becomes the right primary method** — mobile money
identity *is* the phone number, and at that point the SMS cost is a cost of
doing business rather than a cost of having a button. That is Ledger's call to
make alongside the payment rail, not a decision to pre-empt here.

Nothing in this build blocks it, and the move to Supabase made it cheaper than
it was. Everything past the callback is provider-agnostic: the DAL, the session
shape and the saved requests do not know or care which provider minted the
identity. Adding phone sign-in is another `signInWithOtp` call and another
button on `SignInPanel`, not a rewrite.

---

## Architecture

```
browser                    server                         Supabase
───────                    ──────                         ────────
[Continue with Google]
        │
        │  Server Action: startGoogleSignIn(next)
        ├──────────────────────►  signInWithOAuth ──────────►  returns a URL
        │                                                          │
        │  ◄──── redirect ─────────────────────────────────────────┘
        ▼
  accounts.google.com
        │
        │  ?code=…&next=/account
        ▼
  /auth/callback  ────────►  exchangeCodeForSession ────────►  sets cookies
        │
        ▼
   redirect to `next`
```

Four files, and the boundaries between them are the design:

| File | Job |
|---|---|
| `src/server/auth/config.ts` | Is auth configured at all. Imports no Supabase code. |
| `src/server/auth/supabase.ts` | A request-scoped client wired to Next's cookie jar. |
| `src/server/auth/dal.ts` | `verifySession` / `requireSession` / `requireAdmin`. The only place cookies are read. |
| `src/app/auth/callback/route.ts` | Trades the OAuth code for cookies. |

### `getUser()`, never `getSession()`

The single most important line in the DAL. `getSession()` decodes the cookie and
returns what it says, **without checking that anyone legitimate wrote it**. That
is fine in a browser, where the cookie came from storage the app itself
populated. On a server the cookie is attacker-supplied input, and `getSession()`
would let a forged one through. `getUser()` sends the token to Supabase's auth
server, which validates the signature and confirms the user still exists.

The round trip is the thing being paid for, which is why `verifySession` is
wrapped in React's `cache()` — a page rendering the nav, the account list and a
summary would otherwise make three identical calls.

### `app_metadata`, never `user_metadata`

The admin flag is read from `app_metadata`, which only the Admin API and the
dashboard can write. `user_metadata` is populated from whatever the client
passes at sign-up and is editable afterwards **by the user themselves** —
reading an admin flag from there would let anyone with an account promote
themselves with one `updateUser({ data: { admin: true } })` call.

This is stated in three places (`dal.ts`, `admin.ts`, and here) because it is
one careless edit away and it fails open.

### What the move off Firebase deleted

Worth recording, because the absence of these is not an oversight:

- **The popup.** Firebase's redirect flow depended on third-party storage on
  `*.firebaseapp.com`, which Chrome, Safari and Firefox block, so the only
  workable option was `signInWithPopup` — with its own failure modes (blocked,
  closed, superseded), each needing its own message. Supabase's flow is a
  top-level redirect, so all of them are unreachable.
- **The two-sources-of-truth problem.** The old panel minted an ID token, posted
  it to a Server Action to be exchanged for a session cookie, then explicitly
  signed the client SDK back out so that two systems did not both believe they
  knew who was signed in. No token is handled by our client code now.
- **The service-account private key.** A secret granting full project access
  that bypassed both Security Rules and App Check, whose most common failure was
  arriving with `\n` escaped rather than as real newlines. **There is no
  server-side auth secret in this application any more.**
- **Firestore Security Rules and their emulator test suite** — a Java process, a
  pinned JDK and its own CI job, kept alive for one property. See below.
- **Analytics and App Check**, with no replacement. The cookie-consent banner
  went with them: asking permission to run analytics that do not exist is worse
  than not asking.

### Why the nav fetches instead of the layout reading cookies

Every catalogue page is statically prerendered. A top-level `await cookies()` in
`layout.tsx` would make every one of them dynamic — a whole prerendered site
traded for a nav label. So the shell stays static and the two client components
that care ask `/api/auth/session`, which goes through the same DAL as everything
else and returns a display name and nothing more. No uid, no email, no token.

---

## Saved order requests

`SavedOrderRequest` in Postgres, via Prisma. Migration
`20260828000000_saved_order_requests`.

This is the customer's **own copy**, and it is deliberately not the same row as
the `Order` that `create-order.ts` writes for every request signed in or out.
The distinction is lifecycle: an `Order` is Soko's operational record and must
survive, while the whole point of this one is that the customer can delete it.
Merging them would mean either a customer can destroy Soko's record, or the
delete button quietly does not delete.

The request is stored as a `Json` column. `Order` already flattens the same
shape into columns because admins filter and join on it; nothing filters on this
one — it is fetched whole, by owner, and rendered.

### The trust boundary

`buildOrderRequest` in `src/server/orders/build-order-request.ts`, shared by both
persistence paths. The browser sends *which product* and *who the customer is*.
It never sends the price, the product name, the carrier or the line total —
those are re-derived from the catalogue, so a hand-crafted request cannot store
a BMW at 5,000 TZS or invent a delivery agent. This is the property the unit
suite exists for.

### Ownership is a `WHERE` clause now

Under Firestore, ownership was a **path segment** (`customers/{uid}/…`) compared
against `request.auth.uid` by a rules file. That worked, and it carried a hazard:
`collection.doc(id)` accepts a *path*, so `doc("a/b/c")` addresses a nested
document and an id taken from the browser could step outside the customer's own
subcollection. The old code carried a regex specifically to stop that.

Now the owner is a column and it is in the `WHERE`. A foreign id matches zero
rows. The injection surface is gone rather than guarded, and delete is one
statement whose count answers both "was it there" and "did we remove it" —
replacing a read-then-delete with a race between the two.

### The guarantee did not leave with the rules file

`firestore.rules` and its 234-line emulator suite proved that one customer could
not read or delete another's requests. Both are deleted. **That property now
lives in `src/server/orders/saved-requests.integration.test.ts`**, running
against real Postgres alongside everything else in `npm test`.

Deleting a security control and its test together is how a codebase quietly
loses a guarantee it still advertises, so those tests are deliberately the same
ones, restated. Both directions are mutation-tested: dropping `customerId` from
the delete's `WHERE`, and dropping it from the list query, each fail exactly one
named test.

### The signed-out path is untouched

A signed-out customer's request is built in the browser and held there. Their
name, phone and address never reach this table. The confirmation screen is the
same screen either way, and it says whether the reference will outlive the tab.

---

## Operator runbook

### Environment variables

| Name | Secret? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Project URL, e.g. `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Legacy `eyJ…` anon key or the newer `sb_publishable_…`. Either works. |
| `NEXT_PUBLIC_SITE_URL` | No | The origin OAuth returns to. Optional; strongly recommended. |
| `SOKO_ADMIN_EMAILS` | No | Comma-separated bootstrap admin addresses. |

Both `NEXT_PUBLIC_` values ship to every visitor by design. What protects your
data is Row Level Security and the fact that Prisma — not the browser — is what
reaches Postgres.

**The `service_role` key must never appear in this repo or this deployment.** It
bypasses RLS entirely. Soko has no use for it.

### Console steps, in order

1. **Supabase → Authentication → Providers → Google.** Enable it. It asks for a
   client ID and secret from a Google Cloud OAuth 2.0 client, and shows you the
   callback URL to paste back into Google's "Authorized redirect URIs".
2. **Supabase → Authentication → URL Configuration.** Set the Site URL, and add
   `https://<your-domain>/auth/callback` to **Redirect URLs**. Add
   `http://localhost:3000/auth/callback` too if you develop locally. Missing
   this is the failure everyone hits: sign-in works right up to the last hop and
   then bounces to an error.
3. **Set the environment variables** in Vercel, then deploy.
4. **Sign in once yourself** and confirm you land back on `/account`.

### Admin access — granting and, more importantly, revoking

Two routes in, and the second exists because of a real chicken-and-egg.

**The bootstrap allowlist.** `SOKO_ADMIN_EMAILS`, read per request. Nothing
inside the app can grant the first admin, and nothing should be able to — an app
that can promote its own users is one bug away from letting a stranger do it.

**The `app_metadata` flag.** Supabase dashboard → Authentication → the user →
add `{"admin": true}` to their **App Metadata** (not User Metadata). This is the
real mechanism once someone is in.

**Revoking is the dangerous one, and it takes two steps.** Clearing the flag
does *not* invalidate an access token already issued; it stays good until it
expires, one hour by default. To end access immediately you must also revoke
their sessions — Supabase dashboard → the user → sign out, or the Admin API's
`signOut(jwt, 'global')`.

> **In a hurry, remove them from `SOKO_ADMIN_EMAILS` first.** That is read per
> request, so it takes effect on their next page load with no token to wait out.
> Then clear the flag and revoke the sessions.

An unverified email is never enough on its own for the allowlist route, because
that route trusts an email string rather than a signed assertion about a user
id. Google always returns a verified address, so in practice this only rejects a
provider added later that does not.

---

## Known gaps and things not verified

- **No rate limit on the save action.** There is a ceiling
  (`MAX_SAVED_REQUESTS_PER_CUSTOMER`, 200) and no limit on how fast a signed-in
  customer reaches it. The ceiling is a courtesy, not a security boundary.
- **No bot attestation.** App Check is gone and Supabase has no equivalent.
  Supabase's built-in auth rate limits are what stands in for it.
- **The OAuth round trip has not been exercised end to end.** It cannot be from
  here: it needs a real Google client, a real callback allowlist entry and a real
  browser. Every server-side piece around it is tested; the hop through Google
  is not. **Sign in once yourself after the first deploy** — that is the step
  that proves it, and this repo's standing rule about a human clicking has
  earned its keep twice already.
- **No retention policy** for the customer PII now stored at rest (#20). Hard
  delete exists and works; scheduled expiry does not.
