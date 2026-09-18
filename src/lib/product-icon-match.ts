import {
  PRODUCT_ICON_KEYS,
  PRODUCT_ICON_KEYWORDS,
  PRODUCT_ICON_LABELS,
  type ProductIconKey,
} from "@/lib/product-icons";

/**
 * Ranks icon keys against free text a partner is typing — the product name
 * and category fields in `ListProductForm` — so the closest matches can
 * surface above the full picture grid as they type, instead of making them
 * scroll the whole set every time.
 *
 * Scoring is deliberately simple and dependency-free (no fuzzy-search
 * library): an exact label or keyword match scores highest, a substring
 * match next, and a shared whole word last. Ties keep `PRODUCT_ICON_KEYS`'s
 * own order, so the result is stable rather than shuffling as someone types.
 *
 * Returns an empty array for a blank or whitespace-only query — callers
 * should treat that as "show the full grid, nothing is suggested yet"
 * rather than "nothing matched."
 */
export function matchProductIcons(
  query: string,
  limit = 6,
): ProductIconKey[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const words = q.split(/\s+/).filter((w) => w.length >= 2);

  const scored = PRODUCT_ICON_KEYS.map((key, index) => {
    const label = PRODUCT_ICON_LABELS[key].toLowerCase();
    const keywords = PRODUCT_ICON_KEYWORDS[key];
    let score = 0;

    if (label === q) score += 100;
    else if (label.includes(q) || q.includes(label)) score += 40;

    for (const keyword of keywords) {
      if (keyword === q) score += 90;
      // `keyword.includes(q)` supports typing a prefix of the keyword
      // ("cha" -> "charger"). The reverse direction only counts when the
      // keyword appears as a whole word (or phrase) inside the query, not
      // merely as a substring — otherwise a short keyword like "plug" can
      // false-positive-match inside an unrelated word like "plugh".
      else if (keyword.includes(q) || containsWholeWord(q, keyword)) {
        score += 25;
      }
    }

    if (score === 0 && words.length > 0) {
      const haystack = [label, ...keywords].join(" ");
      for (const word of words) {
        if (haystack.includes(word)) score += 8;
      }
    }

    return { key, index, score };
  });

  return scored
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.key);
}

/**
 * Whether `needle` (a single word or short phrase) occurs in `haystack` as
 * a whole word/phrase — bounded by the string edges or whitespace — rather
 * than as an arbitrary substring inside a longer word.
 */
function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
}
