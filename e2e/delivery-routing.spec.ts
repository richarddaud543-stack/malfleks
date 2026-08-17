import { test, expect } from "@playwright/test";

// Core business rule under test: a product's delivery page must show the
// brand-delivery panel when its branch offers delivery, and the local-agent
// panel (filtered to that branch's city) otherwise. Picked directly from the
// seed data (src/data) so this is deterministic, not incidental.
//
// toyota-corolla -> branch toyota-dar      -> deliveryOffered: true
// toyota-hilux    -> branch toyota-arusha  -> deliveryOffered: false, city: Arusha

test.describe("delivery routing", () => {
  test("branch with its own delivery shows the brand-delivery panel", async ({ page }) => {
    await page.goto("/delivery/toyota-corolla");

    await expect(page.getByTestId("brand-delivery-panel")).toBeVisible();
    await expect(page.getByTestId("local-agent-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm brand delivery" })).toBeVisible();
  });

  test("branch without its own delivery shows local agents for its city", async ({ page }) => {
    await page.goto("/delivery/toyota-hilux");

    await expect(page.getByTestId("local-agent-panel")).toBeVisible();
    await expect(page.getByTestId("brand-delivery-panel")).toHaveCount(0);

    // Arusha is served by both a city-based agent and a regionsServed-based one.
    await expect(page.getByText("Arusha Swift Couriers")).toBeVisible();
    await expect(page.getByText("Fargo Courier")).toBeVisible();
  });

  test("the Order CTA on a product page reaches the correct delivery panel", async ({ page }) => {
    await page.goto("/products/toyota-hilux");
    await page.getByRole("link", { name: "Order & choose delivery" }).click();

    await expect(page).toHaveURL(/\/delivery\/toyota-hilux$/);
    await expect(page.getByTestId("local-agent-panel")).toBeVisible();
  });

  // The route used to be resolved one page *after* the customer chose. These
  // three cover the same rule reaching the surfaces they choose on.
  test("a product page answers who delivers and how soon, before the click", async ({ page }) => {
    await page.goto("/products/toyota-hilux");

    const route = page.getByTestId("delivery-route-line");
    await expect(route).toContainText("Local agent delivery");
    // Arusha is served by Arusha Swift Couriers (same-day) and Fargo (1–2 days).
    await expect(route).toContainText("Same-day · 2 couriers");
  });

  test("a brand-fleet product names the fleet and promises no arrival time", async ({ page }) => {
    await page.goto("/products/toyota-corolla");

    const route = page.getByTestId("delivery-route-line");
    await expect(route).toContainText("Brand delivery");
    await expect(route).toContainText("Toyota own fleet");
    await expect(route).not.toContainText("Same-day");
  });

  test("an unorderable product says so on its own page, not on the next one", async ({ page }) => {
    // ford-everest is out of stock in the seed data.
    await page.goto("/products/ford-everest");

    await expect(page.getByTestId("delivery-route-line")).toContainText(
      "Out of stock"
    );
    await expect(page.getByTestId("product-unavailable")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Order & choose delivery" })
    ).toHaveCount(0);
  });

  test("search results carry the delivery answer on the card", async ({ page }) => {
    await page.goto("/search?q=hilux");

    const card = page.getByTestId("search-result").first();
    await expect(card.getByTestId("delivery-route-line")).toContainText(
      "Same-day · 2 couriers"
    );
  });
});
