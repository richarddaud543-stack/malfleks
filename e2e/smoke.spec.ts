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

  test("the skip link moves keyboard focus into main, not just the scroll", async ({
    page,
  }) => {
    await page.goto("/brands");

    // First Tab from the top of the document reaches the skip link.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

    await page.keyboard.press("Enter");

    // Without tabIndex={-1} on <main> the browser scrolls but leaves focus on
    // <body>, so the next Tab lands back in the nav the user just skipped.
    await expect(page.locator("main#main-content")).toBeFocused();
  });

  // Every route that sets its own title, not just the two where the doubling
  // bug was found. The root layout appends "— MalFleks" via its `%s` template, so a
  // page that also spells the suffix out renders "… — MalFleks — MalFleks". Guarding
  // only the routes that already broke leaves the same bug free to ship on the
  // other eight.
  const titledRoutes: Array<[route: string, title: string]> = [
    ["/brands", "All brands — MalFleks"],
    ["/agents", "Delivery agents — MalFleks"],
    ["/search", "Search — MalFleks"],
    ["/locator", "Branch locator — MalFleks"],
    ["/order/confirmation", "Order request received — MalFleks"],
    ["/sign-in", "Sign in — MalFleks"],
    ["/apply", "Become a partner — MalFleks"],
    ["/products/toyota-corolla", "Toyota Corolla — Toyota — MalFleks"],
    ["/brands/toyota", "Toyota — MalFleks"],
    ["/brands/toyota/branches/toyota-dar", "Toyota Tanzania — Nyerere Road — MalFleks"],
    ["/delivery/toyota-corolla", "Delivery for Toyota Corolla — MalFleks"],
    ["/products/not-a-real-product", "Product not found — MalFleks"],
  ];

  for (const [route, title] of titledRoutes) {
    test(`${route} sets its title exactly once`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveTitle(title);
    });
  }

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
