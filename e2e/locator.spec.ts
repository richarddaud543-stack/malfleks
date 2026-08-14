import { test, expect, type Page } from "@playwright/test";

const branchCards = (page: Page) => page.getByTestId("locator-branch");

/** Markers are named "<city>, <n> branches" so the count is in the a11y tree. */
const marker = (page: Page, city: string) =>
  page.getByRole("button", { name: new RegExp(`^${city},`) });

const brandChip = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });

test.describe("branch locator", () => {
  test("opens on every branch in the country", async ({ page }) => {
    await page.goto("/locator");

    await expect(page.getByRole("status")).toContainText("across Tanzania");
    expect(await branchCards(page).count()).toBeGreaterThan(10);
  });

  test("a city marker filters the list and updates the shareable URL", async ({
    page,
  }) => {
    await page.goto("/locator");

    await marker(page, "Mwanza").click();

    await expect(page).toHaveURL(/city=Mwanza/);
    await expect(page.getByRole("status")).toContainText("in Mwanza");
    const count = await branchCards(page).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(branchCards(page).nth(i)).toContainText("Mwanza");
    }
  });

  test("a deep link opens on the right city and brand", async ({ page }) => {
    await page.goto("/locator?city=Arusha&brand=halotel");

    await expect(marker(page, "Arusha")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(branchCards(page)).toHaveCount(1);
    await expect(branchCards(page).first()).toContainText("Halotel");
  });

  test("markers can be reached and activated from the keyboard", async ({
    page,
  }) => {
    await page.goto("/locator");

    await marker(page, "Dodoma").focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status")).toContainText("in Dodoma");
    // The global focus ring has to survive activation.
    await expect(marker(page, "Dodoma")).toBeFocused();
  });

  test("deselecting a city returns to the whole country", async ({ page }) => {
    await page.goto("/locator?city=Dodoma");

    await expect(page.getByRole("status")).toContainText("in Dodoma");
    await marker(page, "Dodoma").click();

    await expect(page.getByRole("status")).toContainText("across Tanzania");
    await expect(page).not.toHaveURL(/city=/);
  });

  test("brand and city filters narrow each other", async ({ page }) => {
    await page.goto("/locator");

    await brandChip(page, "Toyota").click();

    // Same reason as the search specs: `count()` never retries, so wait for
    // the filter to have actually landed in the URL before reading it.
    await expect(page).toHaveURL(/brand=toyota/);
    const toyotaOnly = await branchCards(page).count();
    expect(toyotaOnly).toBeGreaterThan(0);

    // Toyota has no Dodoma branch, so that marker goes inert rather than away.
    await expect(marker(page, "Dodoma")).toBeDisabled();

    await marker(page, "Arusha").click();
    await expect(branchCards(page)).toHaveCount(1);
    await expect(branchCards(page).first()).toContainText("Toyota");
  });

  test("shows the couriers covering the selected city", async ({ page }) => {
    await page.goto("/locator?city=Mwanza");

    const coverage = page.getByRole("region", { name: /who delivers/i });
    await expect(coverage.getByText("Mwanza Express Riders")).toBeVisible();
    // Based in Dar, but its regionsServed reach Mwanza.
    await expect(coverage.getByText("Fargo Courier")).toBeVisible();
    await expect(
      coverage.getByText("Dodoma Trusted Delivery")
    ).toHaveCount(0);
  });

  test("a branch links through to its brand's branch page", async ({
    page,
  }) => {
    await page.goto("/locator?city=Dodoma&brand=ford");

    await branchCards(page).first().click();

    await expect(page).toHaveURL(/\/brands\/ford\/branches\/ford-dodoma$/);
    await expect(
      page.getByRole("heading", { name: "CMC Ford — Dodoma" })
    ).toBeVisible();
  });
});
