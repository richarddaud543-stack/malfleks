# Where the code runs

`vercel.json` pins server functions to **`dub1`** — Dublin, which is AWS
`eu-west-1`, which is where the Supabase database lives.

## Why, measured

Vercel deploys Hobby functions to `iad1` (Washington DC) by default. Nothing
chose that; it is what you get when nobody says otherwise. Measured from Dar es
Salaam on 2026-09-02, before the change:

```
X-Vercel-Id: cpt1::iad1::...

/account   TTFB 11.70s
/partner   TTFB  3.89s
/          TTFB  1.39s   (static, cached at the Cape Town edge)
```

Read the header left to right and the problem is the whole story. `cpt1` is
where the request arrives — Cape Town, Vercel's nearest edge to Tanzania.
`iad1` is where the function actually ran. So a customer in Dar es Salaam
reached South Africa, was forwarded to Washington DC, and the function there
opened a database connection to **Ireland**. Every query crossed the Atlantic
and came back before the page could be assembled.

Static pages never noticed, because they are prerendered and served from the
Cape Town cache — which is exactly why this hid for so long. The site *felt*
fine. What was slow was everything that runs code:

- `/auth/callback` — the last hop of signing in
- `/account`, `/partner`, `/admin`
- **every Server Action** — which includes submitting an order request and
  applying to become a partner

Those are the paths that earn money, and they were the slow ones.

## Why Dublin and not Cape Town

Cape Town is nearer the customer; Dublin is nearer the database. Dublin wins,
and it is not close.

The user-to-function distance is paid roughly once per request. The
function-to-database distance is paid **per query**, and a catalogue page makes
several — plus Prisma's own connection setup. From `cpt1` to `eu-west-1` is
about 150 ms of round trip, so three queries cost half a second before any
rendering. From `dub1` the same queries are a millisecond away because they are
in the same AWS region.

If the database ever moves, this file and `vercel.json` move with it. Keeping
the function beside the data is the rule; Dublin is just today's answer.

## What this does not fix

**Cold starts.** A Hobby function that has not been called for a while has to
boot before it answers, and that is most of the 11.7 s above — the second
request to the same route was 3.9 s. Traffic keeps functions warm, and MalFleks
has almost none yet. The uptime monitor in
`claude/malfleks-daily-monitoring.md` helps by hitting the site every five
minutes; real customers will help more.

**The 289 KB of JavaScript** the homepage loads across 13 files. That is not
unreasonable for the app, and on a 200 ms link it is a handful of round trips
rather than a stall, but it is the next thing to look at if the site still
feels heavy once the region change lands.
