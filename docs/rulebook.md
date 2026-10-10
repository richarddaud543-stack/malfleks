# The rulebook

What MalFleks does by itself while nobody is watching. Built 10 Oct 2026 at the
owner's request: *"a robust system … conditions, and execution if conditions
are met or unmet … make it work when I am not around."*

The code is `src/server/rules/`. The owner's view is `/admin/rules`.

## How it runs

- A free outside timer calls `GET /api/rules/run` on the **admin** site every
  15 minutes, with `Authorization: Bearer <CRON_SECRET>`. The route answers at
  once and runs the pass after the response, because timer services give up
  after 30 seconds and switch a job off after repeated failures.
- The daily Vercel cron (`/api/cron/reconcile`) runs one pass too. It is the
  backstop, and — being a different clock — the only thing that can notice the
  timer has stopped.
- A pass runs every rule in `rulebook.ts`, top to bottom, each in its own
  `try`. One `RuleRun` row is written per pass, always.

## The rules

| Rule | When | Then |
| --- | --- | --- |
| `gateway-watch` | ClickPesa fails two checks in a row | Owner emailed and texted; pay page stops offering a link that cannot be made; told again when it is back |
| `clock-watch` | Daily job finds no timer call for over 60 minutes | Owner emailed and texted |
| `money-in-flight` | A refund or payout is waiting on ClickPesa's answer | Ask; update the books; tell the person |
| `payment-recheck` | A pay link is unpaid and not checked lately | Ask ClickPesa directly whether it was paid |
| `checkout-open` | An order was placed while no pay link could be made | Make the link and email it, once |
| `unpaid-reminder` | Unpaid 1 hour after the pay link | One reminder to the customer |
| `delivery-reminder` | Paid 24 hours ago, not delivered | One reminder to the shop and courier |
| `delivery-late` | Paid 3 days ago, not delivered | Owner told once |
| `delivery-final-warning` | Paid 4 days ago, not delivered | Shop told it will be cancelled in 24 hours, and how to stop that |
| `unpaid-cancel` | Unpaid 24 hours after the pay link, and at least 12 hours after the reminder | One last check with ClickPesa, then cancel |
| `delivery-cancel` | Paid 5 days ago, warned at least 24 hours ago, no problem reported, courier not moving, owner not handling it | Cancel; customer and shop told |
| `refund-send` | A paid order was cancelled by the shop, by the deadline, or was paid after cancellation | Full refund to the wallet that paid |
| `payout-send` | A delivered order's share has not been paid | Pay the shop or courier |
| `shop-reliability` | A shop has 3 failed paid orders in 30 days | Hide its products; tell the shop and the owner |
| `books-check` | Once a day: ClickPesa holds less than is owed | Pause money sending; owner emailed and texted |
| `daily-summary` | Every morning after 08:00 EAT | One email, sent on quiet days too |

Every number is in `thresholds.ts`.

## What makes it safe to leave alone

- **Nothing is cancelled that nobody was warned about.** Both cancel rules
  require the warning's once-only mark to exist and to be old enough. That
  holds on the first pass after go-live too: old orders get the warning, not
  the cancellation.
- **Money is never sent twice.** `refund-send.ts` follows `auto-payouts.ts`
  step for step: the reference is written before the request leaves, a row in
  `sending` is never re-sent, and the ledger entry is written only on
  ClickPesa's SUCCESS.
- **One send a pass**, refunds before payouts, inside the same two ceilings
  (`AUTO_PAYOUT_MAX_TZS`, `AUTO_PAYOUT_DAILY_MAX_TZS`).
- **A person's word beats the clock.** A reported delivery problem, a moving
  courier, or the owner pressing "I'm handling this" stops a cancellation.
- **The owner is told once per problem.** An alert is a row with a unique key;
  while it is open the same problem cannot raise another.
- **It stays inside ClickPesa's daily allowance** (`RULES_API_DAILY_BUDGET`,
  default 60 of the unverified account's 100), and counts every request.
- **Two passes never overlap** (a lease in `AppSetting`), and every rule is
  also safe by itself against a double run.

## Switches

| Switch | Where | Effect |
| --- | --- | --- |
| Pause all rules | `/admin/rules` | Only the watching rules run |
| One rule off | `/admin/rules` | That rule is skipped |
| `AUTO_PAYOUTS=on` | Vercel env, admin and shop projects | Without it no refund or payout is sent by the site |
| Pause payouts | `/admin/payouts` | Stops refunds and payouts, including the one sent when a delivery code is entered |

A switch can only make the site do less.

## What still waits for the owner

- An order an admin cancelled, and any change-of-mind refund: how much to
  refund is his decision.
- A refund with no known paying wallet, under 2,500 TSh, or over the ceiling.
- A refund or payout that bounced. It is not retried automatically.
- A delivery the shop reported a problem with.
- A shop whose products were hidden: one button puts them back.

## Going live

1. Run the go-live SQL (migration `20261010090000_rulebook`, with the two
   before it) in the Supabase SQL editor.
2. Merge to `master`. Both Vercel projects deploy.
3. Set `MALFLEKS_OWNER_PHONE` on the admin project (optional; texts also need
   the three Beem settings).
4. Create the timer: cron-job.org, every 15 minutes, the address shown at the
   bottom of `/admin/rules`, header `Authorization: Bearer <CRON_SECRET>`.
   Switch on its failure notification.

Until step 4 the rules run once a day and `/admin/rules` says the timer is not
set up.

## Adding a rule

Write a `Rule` beside the others in `src/server/rules/rules/`, put its
decision in a pure function with tests for every "no", add it to `RULEBOOK` in
the place its kind belongs, and give it a key that will never change.
