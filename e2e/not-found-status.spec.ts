import { test, expect } from "@playwright/test";

/**
 * A URL for something that does not exist must answer **404**, not 200.
 *
 * This file exists because the site failed that for its whole life and nobody
 * noticed until the catalogue was emptied on 2026-09-01: every deleted product
 * URL served the "Product not found" page over an HTTP 200. The cause was not
 * the page — `notFound()` was called correctly — but a `loading.tsx` at the
 * root of the app. A `loading.tsx` is a Suspense boundary; once its fallback
 * renders the response is streaming, the status is already committed, and the
 * `notFound()` that follows can only produce a soft 404.
 *
 * It matters because a marketplace makes dead URLs forever. A partner delists a
 * product, a branch closes, an application is withdrawn — and every one of
 * those URLs stays in somebody's WhatsApp message and in Google's index. A soft
 * 404 tells a crawler the page is fine and tells an uptime check the same.
 *
 * **These assertions are on `response.status()`, deliberately, and not on the
 * visible text.** The text was always right. Only the status was wrong, which
 * is exactly the kind of bug a test that looks at the page cannot see. If
 * someone adds `src/app/loading.tsx` back, or drops a `loading.tsx` anywhere
 * above these routes, this file fails and says why.
 *
 * The e2e suite runs against a seeded database (see ci.yml), so the "exists"
 * cases below use seeded ids and the "missing" cases use ids that never exist.
 */

const MISSING = [
  { path: "/products/no-such-product-xyz", what: "a product" },
  { path: "/brands/no-such-brand-xyz", what: "a brand" },
  { path: "/brands/toyota/branches/no-such-branch-xyz", what: "a branch" },
  { path: "/delivery/no-such-product-xyz", what: "a delivery route" },
  { path: "/no-such-page-at-all-xyz", what: "an unmatched URL" },
];

test.describe("missing resources answer 404", () => {
  for (const { path, what } of MISSING) {
    test(`${path} — ${what} that does not exist`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response, `no response for ${path}`).not.toBeNull();
      expect(response!.status(), `${path} must be a real 404`).toBe(404);
    });
  }
});

test.describe("a brand that does exist is unaffected", () => {
  // The guard on the guard: it is trivial to make everything 404. These prove
  // the change did not do that.
  test("/brands/toyota still renders with 200", async ({ page }) => {
    const response = await page.goto("/brands/toyota");

    expect(response!.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("/brands still renders its listing with 200", async ({ page }) => {
    // Moved into the `(index)` route group so its loading.tsx stops covering
    // /brands/[slug]. Route groups must not change the URL — this asserts that.
    const response = await page.goto("/brands");

    expect(response!.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "All brands", level: 1 }),
    ).toBeVisible();
  });
});
