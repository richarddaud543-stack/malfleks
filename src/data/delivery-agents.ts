import type { DeliveryAgent } from "./types";

/**
 * `eta` replaced a prose `etaEstimate` field on 2026-08-17. Every value here is
 * a faithful translation of the string it stood in for — "Same-day" → 0–0,
 * "1 day" → 1–1, "1–2 days" → 1–2 — so no record's `verified` flag changed:
 * nothing new was claimed, the same fact is just now comparable.
 */
export const deliveryAgents: DeliveryAgent[] = [
  {
    id: "bolt-send",
    name: "Bolt Send",
    city: "Dar es Salaam",
    regionsServed: ["Dar es Salaam"],
    eta: { minDays: 0, maxDays: 0 },
    verified: true,
  },
  {
    id: "fargo-courier",
    name: "Fargo Courier",
    city: "Dar es Salaam",
    regionsServed: ["Dar es Salaam", "Arusha", "Mwanza", "Dodoma"],
    eta: { minDays: 1, maxDays: 2 },
    verified: true,
  },
  {
    id: "arusha-swift-couriers",
    name: "Arusha Swift Couriers",
    city: "Arusha",
    regionsServed: ["Arusha"],
    eta: { minDays: 0, maxDays: 0 },
    verified: false,
  },
  {
    id: "mwanza-express-riders",
    name: "Mwanza Express Riders",
    city: "Mwanza",
    regionsServed: ["Mwanza"],
    eta: { minDays: 0, maxDays: 0 },
    verified: false,
  },
  {
    id: "dodoma-trusted-delivery",
    name: "Dodoma Trusted Delivery",
    city: "Dodoma",
    regionsServed: ["Dodoma"],
    eta: { minDays: 1, maxDays: 1 },
    verified: false,
  },
];
