/**
 * The pictures a product can carry.
 *
 * `Product.image` is **an icon identifier, not a URL** — always required, and
 * `ProductIcon` draws one of these as a continuous-line contour from inline
 * SVG paths, falling back to `smartphone` for anything it does not recognise.
 * That fallback is why this list exists in a plain module rather than only
 * inside the component: a partner picking from a list cannot type a key that
 * silently renders a phone on a pickup truck.
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
 * it runs devices → audio → power → connectivity → vehicles rather than
 * alphabetically.
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
  "sedan",
  "suv",
  "pickup",
  "van",
] as const;

export type ProductIconKey = (typeof PRODUCT_ICON_KEYS)[number];

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
  sedan: "Car — sedan",
  suv: "Car — SUV",
  pickup: "Pickup truck",
  van: "Van",
};

export function isProductIconKey(value: string): value is ProductIconKey {
  return (PRODUCT_ICON_KEYS as readonly string[]).includes(value);
}
