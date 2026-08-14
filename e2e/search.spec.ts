import { test, expect, type Page } from "@playwright/test";

const results = (page: Page) => page.getByTestId("search-result");

/** Facet chips read "<value><count>", so match the label plus its count. */
function chip(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}\\s*\\d+$`) });
}

/**
 * The live-region summary is the one thing that settles after every filter
 * change, so waiting on it keeps the (non-retrying) result counts honest.
 */
async function expectActiveFilters(page: Page, count: number) {
  const suffix = count === 1 ? "1 filter active" : `${count} filters active`;
  await expect(page.getByRole("status")).toContainText(suffix);
}

test.describe("search", () => {
  test("a text query narrows the results and is reflected in the URL", async ({
    page,
  }) => {
    await page.goto("/search");

    const total = await results(page).count();
    expect(total).toBeGreaterThan(10);

    await page.getByRole("searchbox").fill("corolla");

    // The query is debounced into the URL so the search stays shareable.
    await expect(page).toHaveURL(/q=corolla/);
    await expect(results(page).first()).toContainText("Corolla");
    expect(await results(page).count()).toBeLessThan(total);
  });

  test("a deep-linked search restores the query and filters", async ({
    page,
  }) => {
    await page.goto("/search?brand=bmw&city=Arusha");

    await expect(results(page).first()).toBeVisible();
    const count = await results(page).count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(results(page).nth(i)).toContainText("BMW");
      await expect(results(page).nth(i)).toContainText("Arusha");
    }
  });

  test("values in one facet widen the results, a second facet narrows them", async ({
    page,
  }) => {
    await page.goto("/search");

    await chip(page, "BMW").click();
    await expect(page).toHaveURL(/brand=bmw/);
    await expectActiveFilters(page, 1);
    const bmwOnly = await results(page).count();
    expect(bmwOnly).toBeGreaterThan(0);

    // Two values in the same facet are OR-ed together.
    await chip(page, "Ford").click();
    await expect(page).toHaveURL(/brand=ford/);
    await expectActiveFilters(page, 2);
    const bmwAndFord = await results(page).count();
    expect(bmwAndFord).toBeGreaterThan(bmwOnly);

    // A different facet is AND-ed, so it can only narrow.
    await chip(page, "Sedan").click();
    await expectActiveFilters(page, 3);
    const narrowed = await results(page).count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThan(bmwAndFord);
    for (let i = 0; i < narrowed; i++) {
      await expect(results(page).nth(i)).toContainText("Sedan");
    }
  });

  test("the delivery filter shows only branches with their own delivery", async ({
    page,
  }) => {
    await page.goto("/search");

    await page.getByLabel("Brand delivers it themselves").check();
    await expect(page).toHaveURL(/delivery=1/);
    await expectActiveFilters(page, 1);

    const count = await results(page).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(results(page).nth(i)).toContainText("Brand delivery");
    }
  });

  test("a query with no matches offers a reset back to the full catalogue", async ({
    page,
  }) => {
    await page.goto("/search?q=zzzznotathing");

    await expect(results(page)).toHaveCount(0);
    await expect(page.getByText("Nothing matches that yet")).toBeVisible();

    await page.getByRole("button", { name: "Reset search" }).click();

    await expect(page).toHaveURL(/\/search$/);
    await expect(results(page).first()).toBeVisible();
    expect(await results(page).count()).toBeGreaterThan(10);
  });

  test("a result links through to its product page", async ({ page }) => {
    await page.goto("/search?q=hilux");

    await results(page).first().click();

    await expect(page).toHaveURL(/\/products\/toyota-hilux$/);
    await expect(
      page.getByRole("heading", { name: "Toyota Hilux" })
    ).toBeVisible();
  });
});
