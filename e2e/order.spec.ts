import { test, expect, type Page } from "@playwright/test";

// The order request flow, end to end, on both sides of the delivery rule.
// Fixtures come straight from the seed data (src/data):
//
// toyota-corolla -> toyota-dar    -> deliveryOffered: true
// toyota-hilux   -> toyota-arusha -> deliveryOffered: false, city: Arusha
// ford-everest   -> ford-arusha   -> inStock: false

async function fillDetails(page: Page, quantity = "1") {
  await page.getByLabel("Quantity").fill(quantity);
  await page.getByLabel("Full name").fill("Neema Mushi");
  await page.getByLabel("Phone number").fill("0754 123 456");
  await page.getByLabel("Delivery address").fill("12 Sokoine Road, Arusha");
}

test.describe("order request flow", () => {
  test("a brand-delivered order is addressed to the brand's own fleet", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-corolla");

    await fillDetails(page, "2");
    // The line total tracks quantity before anything is submitted.
    await expect(page.getByTestId("order-line-total")).toHaveText(/136,000,000/);

    await page.getByRole("button", { name: "Confirm brand delivery" }).click();

    await expect(page).toHaveURL(/\/order\/confirmation$/);
    await expect(page.getByTestId("order-reference")).toHaveText(
      /^TOY-DAR-[A-Z0-9]{4}$/
    );
    await expect(page.getByText("Brand delivery")).toBeVisible();
    await expect(page.getByText("Toyota own fleet")).toBeVisible();
    // Honest about what this is.
    await expect(page.getByText(/Nothing has been paid/)).toBeVisible();
  });

  test("an agent-delivered order carries the chosen agent through", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-hilux");

    await fillDetails(page);
    await page.getByRole("button", { name: "Confirm agent delivery" }).click();

    // Nothing sent until a courier is picked.
    await expect(page).toHaveURL(/\/delivery\/toyota-hilux$/);
    await expect(
      page.getByText("Select an agent to carry this order.")
    ).toBeVisible();

    await page.getByRole("radio", { name: /Arusha Swift Couriers/ }).check();
    await page.getByRole("button", { name: "Confirm agent delivery" }).click();

    await expect(page).toHaveURL(/\/order\/confirmation$/);
    await expect(page.getByTestId("order-reference")).toHaveText(
      /^TOY-ARU-[A-Z0-9]{4}$/
    );
    await expect(page.getByText("Local agent delivery")).toBeVisible();
    await expect(
      page.getByText(/Arusha Swift Couriers/).first()
    ).toBeVisible();
  });

  test("invalid details are reported inline instead of being sent", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-corolla");

    await page.getByLabel("Phone number").fill("12345");
    await page.getByRole("button", { name: "Confirm brand delivery" }).click();

    await expect(page).toHaveURL(/\/delivery\/toyota-corolla$/);
    await expect(page.getByRole("alert")).toContainText("details need fixing");
    await expect(page.getByLabel("Phone number")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(
      page.getByText("Enter a Tanzanian mobile number, e.g. 0754 123 456.")
    ).toBeVisible();
  });

  test("an out-of-stock product explains itself instead of offering a form", async ({
    page,
  }) => {
    await page.goto("/delivery/ford-everest");

    await expect(page.getByTestId("order-blocked")).toBeVisible();
    await expect(page.getByTestId("order-request-form")).toHaveCount(0);
    await expect(page.getByText(/out of stock/i)).toBeVisible();
  });

  test("the confirmation screen says so when there is no request to show", async ({
    page,
  }) => {
    await page.goto("/order/confirmation");

    await expect(
      page.getByRole("heading", { name: "No order request to show" })
    ).toBeVisible();
  });
});
