/**
 * The pictures a product can carry.
 *
 * `Product.image` is **an icon identifier, not a URL** — always required, and
 * `ProductIcon` draws one of these as a continuous-line contour from inline
 * SVG paths. Anything it does not recognise is drawn as a plain package
 * (`UNKNOWN_PRODUCT_ICON` below). It used to be drawn as a smartphone, which
 * was a tolerable guess while the catalogue was phones and cars and became a
 * phone on a sofa the day it stopped being. A partner picking from this list
 * still cannot type an unknown key — the fallback is for a row written by an
 * older build or by hand — and that is why the list lives in a plain module
 * rather than only inside the component.
 *
 * A real, partner-uploaded photo is a separate, optional field —
 * `Product.photoUrl`, in the `product-photos` Supabase Storage bucket (see
 * `ProductPhotoUpload`) — that the card and detail page show instead of this
 * icon when present. The icon never goes away: it is what every existing row
 * has, what a partner who skips the photo still gets, and what renders if an
 * uploaded photo URL ever fails to load.
 *
 * `ProductIcon` imports `ProductIconKey` from here and types its path map as
 * `Record<ProductIconKey, …>`, so adding a key here without drawing it — or
 * drawing one without listing it — is a type error rather than a blank square.
 *
 * Order matters: this is the order the partner's picture chooser renders in, so
 * it runs devices → audio → power → connectivity → screens/capture/gaming →
 * vehicles (four wheels, then two) → home & backup-power appliances → the
 * everyday categories added when the shop opened up beyond electronics
 * (clothing, shoes, beauty, furniture, food, tools) → "something else" last,
 * rather than alphabetically.
 */
export const PRODUCT_ICON_KEYS = [
  "smartphone",
  "tablet",
  "laptop",
  "smartwatch",
  "earbuds",
  "headphones",
  "speaker",
  "powerbank",
  "charger",
  "cable",
  "router",
  "simcard",
  "tv",
  "camera",
  "console",
  "printer",
  "sedan",
  "suv",
  "pickup",
  "van",
  "motorcycle",
  "bicycle",
  "generator",
  "fridge",
  "ac",
  "fan",
  "microwave",
  "gas-cylinder",
  "tshirt",
  "shoe",
  "bottle",
  "sofa",
  "basket",
  "wrench",
  "package",
] as const;

export type ProductIconKey = (typeof PRODUCT_ICON_KEYS)[number];

/**
 * What `ProductIcon` draws for a key it does not know: a neutral package.
 * Deliberately says nothing about what is inside — the honest picture for
 * "we don't know what this is" is not a confident drawing of something else.
 */
export const UNKNOWN_PRODUCT_ICON: ProductIconKey = "package";

/** What a partner reads in the picture chooser. */
export const PRODUCT_ICON_LABELS: Record<ProductIconKey, string> = {
  smartphone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  smartwatch: "Smartwatch",
  earbuds: "Earbuds",
  headphones: "Headphones",
  speaker: "Speaker",
  powerbank: "Power bank",
  charger: "Charger",
  cable: "Charging cable",
  router: "Router",
  simcard: "SIM card",
  tv: "TV",
  camera: "Camera",
  console: "Game console",
  printer: "Printer",
  sedan: "Car — sedan",
  suv: "Car — SUV",
  pickup: "Pickup truck",
  van: "Van",
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
  generator: "Generator",
  fridge: "Fridge",
  ac: "Air conditioner",
  fan: "Fan",
  microwave: "Microwave",
  "gas-cylinder": "Gas cylinder",
  tshirt: "Clothing",
  shoe: "Shoes",
  bottle: "Beauty",
  sofa: "Furniture",
  basket: "Food",
  wrench: "Tools",
  package: "Something else",
};

export function isProductIconKey(value: string): value is ProductIconKey {
  return (PRODUCT_ICON_KEYS as readonly string[]).includes(value);
}

/**
 * Search terms a partner might actually type — brand/model names, local
 * usage (`boda` for a motorcycle, `friji` for a fridge), and synonyms — that
 * point back to one icon key. This is what `matchProductIcons` (see
 * `product-icon-match.ts`) ranks against as the partner types their product's
 * name and category, so the right icon can surface before they've finished
 * typing rather than making them scan the whole grid.
 *
 * Keep this list generous rather than tidy: a term that matches nothing costs
 * nothing, a term that's missing costs the partner a scroll.
 */
export const PRODUCT_ICON_KEYWORDS: Record<ProductIconKey, string[]> = {
  smartphone: ["phone", "smartphone", "iphone", "android", "samsung", "mobile", "cell", "galaxy"],
  tablet: ["tablet", "ipad", "tab"],
  laptop: ["laptop", "macbook", "notebook", "computer", "pc", "chromebook"],
  smartwatch: ["watch", "smartwatch", "fitness band", "wearable", "band"],
  earbuds: ["earbuds", "airpods", "buds", "earphones", "in-ear"],
  headphones: ["headphones", "headset", "over-ear", "cans"],
  speaker: ["speaker", "bluetooth speaker", "boombox", "sound", "soundbar"],
  powerbank: ["power bank", "powerbank", "battery pack", "portable charger"],
  charger: ["charger", "adapter", "plug", "wall charger", "fast charger"],
  cable: ["cable", "cord", "usb cable", "charging cable", "lightning cable", "type-c"],
  router: ["router", "wifi", "modem", "hotspot", "internet"],
  simcard: ["sim", "sim card", "simu", "line", "starter pack"],
  tv: ["tv", "television", "smart tv", "screen"],
  camera: ["camera", "dslr", "mirrorless", "gopro", "action cam", "camcorder"],
  console: ["console", "playstation", "xbox", "game", "gaming", "controller", "ps5", "ps4", "nintendo"],
  printer: ["printer", "print", "inkjet", "laser printer", "scanner"],
  sedan: ["sedan", "saloon", "corolla", "camry", "car", "3 series", "1 series", "5 series", "focus"],
  suv: ["suv", "land cruiser", "prado", "rav4", "x1", "x3", "x5", "territory", "everest", "crossover"],
  pickup: ["pickup", "hilux", "ranger", "double cab", "truck", "bakkie", "raptor"],
  van: ["van", "hiace", "transit", "minibus", "daladala"],
  motorcycle: ["motorcycle", "motorbike", "bike", "boda", "boda boda", "bajaj", "scooter", "piki piki"],
  bicycle: ["bicycle", "bike", "cycle", "baiskeli", "pushbike"],
  generator: ["generator", "genset", "jenereta", "standby power", "backup power"],
  fridge: ["fridge", "refrigerator", "freezer", "friji"],
  ac: ["ac", "air conditioner", "aircon", "split unit", "cooling"],
  fan: ["fan", "stand fan", "pedestal fan", "ceiling fan", "feni"],
  microwave: ["microwave", "microwave oven", "oven"],
  "gas-cylinder": ["gas cylinder", "cooking gas", "lpg", "gas cooker", "mtungi"],
  tshirt: ["clothes", "clothing", "fashion", "shirt", "t-shirt", "tshirt", "dress", "trousers", "jeans", "nguo", "shati", "gauni", "suruali", "kitenge"],
  shoe: ["shoe", "shoes", "sneakers", "sandals", "boots", "heels", "viatu", "kiatu", "raba", "ndala"],
  bottle: ["beauty", "cosmetics", "lotion", "perfume", "makeup", "skincare", "shampoo", "urembo", "vipodozi", "manukato"],
  sofa: ["sofa", "couch", "furniture", "chair", "table", "bed", "wardrobe", "samani", "kiti", "meza", "kitanda", "kabati"],
  basket: ["food", "groceries", "grocery", "rice", "flour", "sugar", "cooking oil", "snacks", "chakula", "vyakula", "mchele", "unga", "sukari"],
  wrench: ["tools", "tool", "spanner", "wrench", "drill", "hammer", "hardware", "zana", "vifaa", "spana", "nyundo"],
  package: ["other", "package", "parcel", "box", "kifurushi", "nyingine"],
};
