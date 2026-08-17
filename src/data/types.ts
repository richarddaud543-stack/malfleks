export type BrandCategory = "automotive" | "electronics" | "telecom";

export interface Brand {
  id: string;
  slug: string;
  name: string;
  category: BrandCategory;
  logo: string;
  accentColor: string;
  description: string;
  website?: string;
}

export interface Branch {
  id: string;
  brandId: string;
  name: string;
  city: string;
  region: string;
  addressLine: string;
  country: "Tanzania";
  phone?: string;
  hours: string;
  deliveryOffered: boolean;
  verified: boolean;
  /**
   * Approximate city-centre position, used to place the branch on the locator
   * map. These are city coordinates, not surveyed shopfront positions, so they
   * say nothing about whether the rest of the record is `verified`.
   */
  coords?: { lat: number; lng: number };
}

export interface Product {
  id: string;
  slug: string;
  branchId: string;
  brandId: string;
  name: string;
  category: string;
  priceTZS: number;
  image: string;
  description: string;
  specs?: Record<string, string>;
  inStock: boolean;
}

/**
 * How long a courier takes, counted in days from pickup, where `0` is same
 * day. Structured rather than the prose it replaced ("Same-day", "1–2 days")
 * because the site now has to *rank* couriers — "who is fastest in this city"
 * cannot be answered by comparing strings. The display label is derived from
 * this by `formatEta()`, so there is one fact and one renderer of it, not two
 * fields that can drift apart.
 */
export interface DeliveryEta {
  minDays: number;
  /** Inclusive. Equal to `minDays` when the courier quotes a single figure. */
  maxDays: number;
}

export interface DeliveryAgent {
  id: string;
  name: string;
  city: string;
  regionsServed: string[];
  phone: string;
  eta: DeliveryEta;
  verified: boolean;
}
