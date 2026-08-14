import type { DeliveryAgent } from "./types";

export const deliveryAgents: DeliveryAgent[] = [
  {
    id: "bolt-send",
    name: "Bolt Send",
    city: "Dar es Salaam",
    regionsServed: ["Dar es Salaam"],
    phone: "+255 68 000 0001",
    etaEstimate: "Same-day",
    verified: true,
  },
  {
    id: "fargo-courier",
    name: "Fargo Courier",
    city: "Dar es Salaam",
    regionsServed: ["Dar es Salaam", "Arusha", "Mwanza", "Dodoma"],
    phone: "+255 68 000 0002",
    etaEstimate: "1–2 days",
    verified: true,
  },
  {
    id: "arusha-swift-couriers",
    name: "Arusha Swift Couriers",
    city: "Arusha",
    regionsServed: ["Arusha"],
    phone: "+255 68 000 0003",
    etaEstimate: "Same-day",
    verified: false,
  },
  {
    id: "mwanza-express-riders",
    name: "Mwanza Express Riders",
    city: "Mwanza",
    regionsServed: ["Mwanza"],
    phone: "+255 68 000 0004",
    etaEstimate: "Same-day",
    verified: false,
  },
  {
    id: "dodoma-trusted-delivery",
    name: "Dodoma Trusted Delivery",
    city: "Dodoma",
    regionsServed: ["Dodoma"],
    phone: "+255 68 000 0005",
    etaEstimate: "1 day",
    verified: false,
  },
];
