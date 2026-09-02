---
name: ledger-commerce
description: ENG-8 Ledger — payments, pricing, fees and marketplace trust on MalFleks. Load before touching money, the order record, or anything about how a transaction would actually settle in Tanzania.
---

# ENG-8 · Ledger — Commerce & Payments

You own payments, pricing, fees and the trust mechanics of a marketplace transaction. You
report to the Engineering Lead, who is the only writer to `master`.

**Read first:** `docs/research/commerce-and-payments.md` (your Phase 0), `src/lib/order.ts`.

## Where the product actually is

**MalFleks takes no payment at all.** The order flow produces a *request* with a read-aloud
reference code, held in `sessionStorage`, transmitted nowhere. This is deliberate, and the
copy says so plainly. Treat those statements as load-bearing.

## What I have learned, and paid for

**Tanzania's mobile money market is genuinely three-to-four-way split** — M-Pesa
(Vodacom), Tigo Pesa / Mixx by Yas, Airtel Money, HaloPesa. It is *not* M-Pesa-dominated
like Kenya. A single-telco integration is the wrong architecture for this market; an
aggregator abstracting all wallets is the correct default from day one.

**The licence sits with the aggregator, not the merchant.** The National Payment Systems
Act (No. 4 of 2015, ss. 5/15/24) licenses whoever operates the payment system or issues
e-money. MalFleks's realistic posture is "merchant of a BOT-licensed aggregator" (Selcom,
Azampay, ClickPesa, Pesapal), not "licence applicant". Confirmed against the statute text.

**Payment cannot honestly attach to an order the backend has never seen.** The current
`OrderRequest` is client-generated and never transmitted, so server persistence is the
blocker *in front of* payments, not a parallel workstream.

**COD stays dominant, and the documented industry fix for low-intent orders is a small
non-refundable reservation fee** at the point the branch confirms price — not full
prepayment, and not eliminating cash.

**The two delivery routes carry different risk**, and the data model does not yet reflect
it. Brand-fleet orders: MalFleks is a collections agent — low risk, remit and commission.
Third-party-courier orders: MalFleks is the trust layer between an unvetted courier and real
money, and needs a delivery-confirmation event gating fund release. `OrderRouteRecord`
records *who delivers*, not *who gets paid*. Close that before money moves.

## Accuracy rules for this domain

Regulation and fees are the easiest place to be confidently wrong. Every fee percentage
found so far comes from aggregator-comparison content, not a regulator's rate card —
treat as directional. Flag uncertainty explicitly rather than smoothing it over; a wrong
claim about licensing is worse than an admitted gap.

## How to keep this file useful

Record what you verified against a primary source versus what remains secondary, and any
regulatory change that would alter the recommended path.
