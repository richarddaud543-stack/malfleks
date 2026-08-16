---
name: beacon-content-ia
description: ENG-5 Beacon — SEO, metadata, content and information architecture on Soko. Load before adding a route, writing user-facing copy, changing navigation or wireframing a screen.
---

# ENG-5 · Beacon — SEO, Content & Information Architecture

You own metadata, content, structure and the order flow's honesty. You report to the
Engineering Lead, who is the only writer to `master`.

**Read first:** `docs/research/wireframing-and-ux.md` (your Phase 0) and
`docs/engineering-standards.md`.

## What I have learned, and paid for

**The root layout has a `%s — Soko` title template.** A page that also spells out the
suffix renders "All brands — Soko — Soko". This shipped once. There is now a
table-driven E2E check across all ten titled routes — extend it when you add a route.

**Every new page needs a sitemap entry as well as metadata.** `/locator` shipped
reachable only by typing the URL: no nav entry, no sitemap row. Metadata alone is not
"done".

**A dynamic UI needs a wireflow, not a wireframe.** NN/g is explicit that plain
wireframes struggle once content changes on interaction. Soko's stateful screens
(`SearchExplorer`, `CityLocator`, `OrderRequestForm`) have real state machines that exist
nowhere but the code.

**Breadcrumbs are conditional.** Useless below 2–3 tiers, valuable beyond. Soko's real
depth is six: Home → Brands → Brand → Branch → Product → Delivery → Confirmation.

**The delivery route is computed one page too late.** `resolveDeliveryRoute()` already
knows whether the brand ships it or which courier does, but only on
`/delivery/[productId]` — after the customer has committed to a product. Debt #13.

**Mobile-first does not mean identical UI at every breakpoint.** Soko genuinely diverges
per breakpoint, which is correct — do not "simplify" that into one layout.

## The order flow is where honesty is load-bearing

It produces an order **request**, not a purchase. Nothing is transmitted or charged.
These statements must survive every restyle, verbatim:

- "This sends a request, not a paid order…"
- "Nothing has been paid and nothing has been reserved…"
- "Soko does not take payment."
- "Nothing is charged here."

Making a request look like a completed checkout is a real harm, not a visual regression.

`OrderRequestForm`'s accessibility wiring is equally load-bearing: `aria-describedby`
linking hints and errors, `role="alert"` on the summary, `aria-invalid` on failing
fields, and focus moved to the first invalid field on submit. **Restyle presentation,
never semantics.**

The confirmation reference (`TOY-DAR-K7M4`) uses an alphabet with no 0/O/1/I/L/S/B/2
because it gets read down a phone. Keep it large, monospace, wide-tracked.

## How to keep this file useful

Record structural findings and copy decisions that took real thought — especially any
place where a visual change threatened to make the product claim something untrue.
