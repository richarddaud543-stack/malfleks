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
  /**
   * Optional since 2026-08-31. A street address is only present when it has
   * been confirmed against a primary source — the brand's own site or a
   * document from the business. The addresses that used to fill this field
   * were plausible street names nobody had checked, and the one that could
   * finally be checked (iStore) turned out to be wrong: the catalogue said
   * Mlimani City, their own contact page says Mikocheni.
   *
   * A branch without one still knows its brand, city and delivery status,
   * which are all true. The UI says the address should be confirmed with the
   * brand rather than printing a guess.
   */
  addressLine?: string;
  country: "Tanzania";
  phone?: string;
  /** Optional, and absent unless confirmed — see `addressLine`. */
  hours?: string;
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
  /** A real uploaded photo. Absent on most rows — the icon is the fallback. */
  photoUrl?: string;
  /**
   * Every photo, main one first (so `photoUrls[0] === photoUrl`). Absent when
   * the row has no list — including rows from before the gallery that have
   * only `photoUrl`. Read through `productPhotoList` rather than directly.
   */
  photoUrls?: string[];
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
  /**
   * Optional, and absent for every seeded courier as of 2026-08-31: the
   * numbers that used to be here were invented. `AgentCard` and
   * `AgentChoice` render nothing rather than a dead `tel:` link.
   */
  phone?: string;
  eta: DeliveryEta;
  verified: boolean;
}
