import { test, expect } from "@playwright/test";

function collectConsoleErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("smoke", () => {
  test("home page loads with no console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("nav links reach the search, brands and agents pages", async ({ page }) => {
    await page.goto("/");

    // Scoped to the header: "Explore brands" and the footer's "All brands" also
    // point at /brands, and an unscoped name match would hit all three.
    const nav = page.locator("header");

    await nav.getByRole("link", { name: "Brands", exact: true }).click();
    await expect(page).toHaveURL(/\/brands$/);
    await expect(page.getByRole("heading", { name: "All brands" })).toBeVisible();

    await nav.getByRole("link", { name: "Delivery Agents" }).click();
    await expect(page).toHaveURL(/\/agents$/);
    await expect(page.getByRole("heading", { name: "Delivery agents" })).toBeVisible();

    await nav.getByRole("link", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("all 6 brands render on the brands page", async ({ page }) => {
    await page.goto("/brands");

    for (const name of ["Toyota", "Ford", "BMW", "Oraimo", "Apple", "Halotel"]) {
      await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
    }
  });

  test("an unknown product id renders the branded 404 page", async ({ page }) => {
    await page.goto("/products/not-a-real-product");

    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse all brands" })).toBeVisible();
  });
});
