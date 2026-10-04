import { revalidatePath } from "next/cache";

/**
 * Refreshes a shop page after something on it changed -- in both languages.
 *
 * Every shop page exists at `/sw/…` and `/en/…` (see `src/i18n/locale.ts`),
 * so the plain address a visitor uses (`/search`) is not an address the cache
 * knows. This names the page the way the cache does, `/[lang]/search`, which
 * covers both at once. Use it for every shop page; plain `revalidatePath` is
 * still right for the admin console, which has one language.
 *
 * `scope: "layout"` refreshes everything under the address as well
 * (`/brands` and every brand and branch page).
 */
export function revalidateSitePath(path: string, scope: "page" | "layout" = "page"): void {
  revalidatePath(path === "/" ? "/[lang]" : `/[lang]${path}`, scope);
}
