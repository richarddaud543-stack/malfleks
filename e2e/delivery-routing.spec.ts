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
});
