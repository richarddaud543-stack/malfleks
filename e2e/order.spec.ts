import { test, expect, type Page } from "@playwright/test";

// The order request flow, end to end, on both sides of the delivery rule.
// Fixtures come straight from the seed data (src/data):
//
// toyota-corolla -> toyota-dar    -> deliveryOffered: true
// toyota-hilux   -> toyota-arusha -> deliveryOffered: false, city: Arusha
// ford-everest   -> ford-arusha   -> inStock: false

async function fillDetails(page: Page, quantity = "1", city?: string) {
  await page.getByLabel("Quantity").fill(quantity);
  await page.getByLabel("Full name").fill("Neema Mushi");
  await page.getByLabel("Phone number").fill("0754 123 456");
  if (city) await page.getByLabel("Delivery city").selectOption(city);
  await page.getByLabel("Delivery address").fill("12 Sokoine Road, Arusha");
  await page.getByLabel(/I am 18 or older/).check();
}

// These run signed out, which is all CI can be. Since 4 Oct 2026 a signed-out
// customer cannot place anything -- ordering means paying, and paying needs an
// account -- so what is proved here is the form itself, and that the way into
// ordering is a trip to sign-in that brings the customer back to a form still
// filled in. What a signed-in customer's submit does is covered at unit level
// (`OrderRequestForm.auth.test.tsx`) and against a real database
// (`events.integration.test.ts`).
const SIGN_IN = "Sign in to order";

test.describe("order request flow", () => {
  test("a signed-out customer is sent to sign in, and finds the form as they left it", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-corolla");

    await fillDetails(page, "2", "Dar es Salaam");
    // The line total tracks quantity before anything is submitted.
    await expect(page.getByTestId("order-line-total")).toHaveText(/136,000,000/);
    await expect(page.getByText("Toyota own fleet")).toBeVisible();
    // Honest about what the button does.
    await expect(page.getByText(/Ordering needs an account/)).toBeVisible();

    await page.getByRole("button", { name: SIGN_IN }).click();

    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdelivery%2Ftoyota-corolla$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to MalFleks", level: 1 })
    ).toBeVisible();

    // Back where sign-in would return them: nothing has to be typed again.
    await page.goto("/delivery/toyota-corolla");
    await expect(page.getByLabel("Full name")).toHaveValue("Neema Mushi");
    await expect(page.getByLabel("Quantity")).toHaveValue("2");
    await expect(page.getByLabel("Delivery city")).toHaveValue("Dar es Salaam");
    await expect(page.getByLabel("Delivery address")).toHaveValue("12 Sokoine Road, Arusha");
  });

  test("an agent-delivered order cannot go on until a courier is picked", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-hilux");

    await fillDetails(page, "1", "Arusha");
    await page.getByRole("button", { name: SIGN_IN }).click();

    // Nothing happens until a courier is picked.
    await expect(page).toHaveURL(/\/delivery\/toyota-hilux$/);
    await expect(
      page.getByText("Select an agent to carry this order.")
    ).toBeVisible();

    await page.getByRole("radio", { name: /Arusha Swift Couriers/ }).check();
    // The summary names the courier before anything is committed.
    await expect(
      page.getByText(/Arusha Swift Couriers/).first()
    ).toBeVisible();
    await page.getByRole("button", { name: SIGN_IN }).click();

    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdelivery%2Ftoyota-hilux$/);
  });

  // The live case this exists for: a Dodoma shop, an address in Kigoma, and an
  // order that was accepted and could be paid for.
  test("an order going outside the shop's city is refused, with the way to a nearer shop", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-corolla");

    // Asked plainly, with the one city this shop delivers in.
    await expect(page.getByText("This shop delivers within Dar es Salaam.")).toBeVisible();

    await fillDetails(page, "1", "Somewhere else");
    await expect(
      page.getByRole("link", { name: "Find a shop in your city" })
    ).toHaveAttribute("href", "/locator");

    await page.getByRole("button", { name: SIGN_IN }).click();
    await expect(page).toHaveURL(/\/delivery\/toyota-corolla$/);
    await expect(page.getByLabel("Delivery city")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/only delivers within Dar es Salaam/)).toBeVisible();
  });

  test("invalid details are reported inline instead of being sent", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-corolla");

    await page.getByLabel("Phone number").fill("12345");
    await page.getByRole("button", { name: SIGN_IN }).click();

    await expect(page).toHaveURL(/\/delivery\/toyota-corolla$/);
    // Scoped to the form: Next's route announcer is also role="alert", and an
    // unscoped match is a strict-mode violation.
    await expect(
      page.getByTestId("order-request-form").getByRole("alert")
    ).toContainText("details need fixing");
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
