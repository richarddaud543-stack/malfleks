/**
 * The categories MalFleks suggests when a partner lists a product, and the
 * details ("specs") worth asking for in each.
 *
 * `Product.category` is free text and stays free text: a marketplace that
 * only lets a shop choose from our list cannot list the thing we did not
 * think of. But free text on its own gives search three facets for one idea —
 * "Phones", "phones " and "PHONES" — so the form offers these as suggestions
 * and the server folds case and spacing variants of a known name back onto
 * its one spelling. An unknown category is kept as the partner typed it, only
 * trimmed and single-spaced.
 *
 * The first block is every category the seeded catalogue (`src/data`) already
 * uses, spelled exactly as it is there, so a new listing lands in the same
 * search facet as the products already on the shop. The second block is the
 * broader, obvious set. "Laptops" is deliberately absent as its own entry:
 * the catalogue already says "Laptop", and two facets one letter apart is the
 * problem this file exists to prevent — see `CATEGORY_ALIASES`.
 */
export const PRODUCT_CATEGORIES = [
  // Already on the shop — `src/data/products.ts`.
  "Smartphone",
  "Tablet",
  "Laptop",
  "Smartwatch",
  "Earbuds",
  "Speaker",
  "Power Bank",
  "Router",
  "SIM Card",
  "Sedan",
  "SUV",
  "Pickup",
  "Van",
  // The broader set a general marketplace needs.
  "Phones",
  "TVs & Audio",
  "Home appliances",
  "Cars",
  "Motorcycles",
  "Fashion",
  "Shoes",
  "Beauty",
  "Furniture",
  "Food & Groceries",
  "Tools",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/**
 * Other things people type for a category we already have. Keys are in the
 * folded form `foldCategory` produces (lower case, single spaces).
 */
const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  laptops: "Laptop",
  tablets: "Tablet",
  smartphones: "Smartphone",
  smartwatches: "Smartwatch",
  speakers: "Speaker",
  routers: "Router",
  "power banks": "Power Bank",
  powerbank: "Power Bank",
  powerbanks: "Power Bank",
  "sim cards": "SIM Card",
  sedans: "Sedan",
  suvs: "SUV",
  pickups: "Pickup",
  vans: "Van",
  phone: "Phones",
  car: "Cars",
  motorcycle: "Motorcycles",
  "tvs and audio": "TVs & Audio",
  "tv & audio": "TVs & Audio",
  "tv and audio": "TVs & Audio",
  "home appliance": "Home appliances",
  appliances: "Home appliances",
  shoe: "Shoes",
  "food and groceries": "Food & Groceries",
  food: "Food & Groceries",
  groceries: "Food & Groceries",
  tool: "Tools",
};

/** Lower case, trimmed, runs of whitespace collapsed to one space. */
function foldCategory(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const CANONICAL_BY_FOLDED = new Map<string, ProductCategory>(
  PRODUCT_CATEGORIES.map((category) => [foldCategory(category), category]),
);

/**
 * The canonical category a typed value means, or `null` if it is not one we
 * know. `"phones "` and `"PHONES"` are both `"Phones"`.
 */
export function canonicalCategory(value: string): ProductCategory | null {
  const folded = foldCategory(value);
  if (folded === "") return null;
  return CANONICAL_BY_FOLDED.get(folded) ?? CATEGORY_ALIASES[folded] ?? null;
}

/**
 * What gets stored. A known category in its one spelling; anything else as
 * typed, trimmed and single-spaced. Never invents a category and never
 * refuses one — an empty result means the input was blank, which the caller
 * reports as a missing field.
 */
export function normalizeCategory(value: string): string {
  return canonicalCategory(value) ?? value.trim().replace(/\s+/g, " ");
}

/**
 * The details buyers ask about, per category — offered as one-tap chips when
 * a partner has picked a known category and not yet written any details of
 * their own. Labels only: the values are the partner's to give.
 *
 * Kept to what a buyer here actually asks before paying. "Condition" is on
 * almost every list because new-versus-used is the first question in this
 * market, and "Warranty" because it is the second.
 */
const PHONE_SPECS = ["Storage", "RAM", "Colour", "Condition", "Warranty"];
const CAR_SPECS = ["Year", "Mileage", "Engine", "Transmission", "Fuel", "Colour"];

export const CATEGORY_SPEC_SUGGESTIONS: Partial<Record<ProductCategory, readonly string[]>> = {
  Phones: PHONE_SPECS,
  Smartphone: PHONE_SPECS,
  Tablet: ["Storage", "RAM", "Screen size", "Colour", "Condition", "Warranty"],
  Laptop: ["Processor", "RAM", "Storage", "Screen size", "Condition", "Warranty"],
  Smartwatch: ["Colour", "Strap size", "Works with", "Condition", "Warranty"],
  Earbuds: ["Colour", "Battery life", "Condition", "Warranty"],
  Speaker: ["Power", "Battery life", "Colour", "Condition", "Warranty"],
  "Power Bank": ["Capacity", "Ports", "Colour", "Warranty"],
  Router: ["Network", "Speed", "SIM slot", "Warranty"],
  "SIM Card": ["Network", "Bundle", "Valid for"],
  "TVs & Audio": ["Screen size", "Resolution", "Smart TV", "Condition", "Warranty"],
  "Home appliances": ["Capacity", "Power", "Colour", "Condition", "Warranty"],
  Cars: CAR_SPECS,
  Sedan: CAR_SPECS,
  SUV: CAR_SPECS,
  Pickup: CAR_SPECS,
  Van: CAR_SPECS,
  Motorcycles: ["Year", "Mileage", "Engine", "Colour", "Condition"],
  Fashion: ["Size", "Colour", "Material", "Condition"],
  Shoes: ["Size", "Colour", "Material", "Condition"],
  Beauty: ["Size", "Shade", "Expiry date"],
  Furniture: ["Material", "Size", "Colour", "Condition"],
  "Food & Groceries": ["Weight", "Expiry date", "Storage"],
  Tools: ["Power", "Condition", "Warranty"],
};

/**
 * The detail labels to offer for a typed category. Empty when the category is
 * not one we know or has no list ("Other") — the form then shows no chips
 * rather than a guess.
 */
export function specSuggestionsFor(category: string): readonly string[] {
  const canonical = canonicalCategory(category);
  if (!canonical) return [];
  return CATEGORY_SPEC_SUGGESTIONS[canonical] ?? [];
}
