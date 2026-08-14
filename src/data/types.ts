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

export interface DeliveryAgent {
  id: string;
  name: string;
  city: string;
  regionsServed: string[];
  phone: string;
  etaEstimate: string;
  verified: boolean;
}
