import { brands } from "./brands";
import { branches } from "./branches";
import { products } from "./products";
import { deliveryAgents } from "./delivery-agents";
import type { Brand, Branch, Product, DeliveryAgent } from "./types";

export type { Brand, Branch, Product, DeliveryAgent, BrandCategory } from "./types";
export { brands, branches, products, deliveryAgents };

export function getAllBrands(): Brand[] {
  return brands;
}

export function getBrandBySlug(slug: string): Brand | undefined {
  return brands.find((b) => b.slug === slug);
}

export function getBrandById(id: string): Brand | undefined {
  return brands.find((b) => b.id === id);
}

export function getBranchesByBrandId(brandId: string): Branch[] {
  return branches.filter((b) => b.brandId === brandId);
}

export function getBranchById(id: string): Branch | undefined {
  return branches.find((b) => b.id === id);
}

export function getProductsByBranchId(branchId: string): Product[] {
  return products.filter((p) => p.branchId === branchId);
}

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getAgentsForCity(city: string): DeliveryAgent[] {
  return deliveryAgents.filter(
    (a) => a.city === city || a.regionsServed.includes(city)
  );
}
