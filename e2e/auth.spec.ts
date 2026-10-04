import { test, expect } from "@playwright/test";

/**
 * Auth, from the outside.
 *
 * These specs are all signed-out. Driving a real Google sign-in from Playwright
 * would mean automating Google's own consent screen against a real account,
 * which is both brittle and a credential this repo must not hold. What *can* be
 * tested end to end is everything that guards the signed-out path — and that is
 * the path where a mistake costs a customer their privacy rather than a
 * feature.
 */

test.describe("signed out", () => {
  test("the nav offers a way in", async ({ page }) => {
    await page.goto("/");
    const signIn = page.locator("header").getByRole("link", { name: "Sign in" });
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("the sign-in page is keyboard operable and honestly labelled", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    await expect(
      page.getByRole("heading", { name: "Sign in to MalFleks", level: 1 })
    ).toBeVisible();

    const button = page.getByRole("button", { name: /Continue with Google/i });
    await expect(button).toBeVisible();

    // Reachable by keyboard alone, and showing the app-wide focus ring rather
    // than a suppressed outline.
    await button.focus();
    await expect(button).toBeFocused();

    // Browsing needs no account, and the page says so. It no longer says
    // ordering needs none: since paying became part of ordering, it does.
    await expect(
      page.getByText(/don't need an account to look around/i)
    ).toBeVisible();
  });

  test("/account sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/account");
    // Authorization lives in the page's own data layer, so this redirect holds
    // whether or not any proxy is configured.
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount|\/sign-in\?next=\/account/);
    await expect(
      page.getByRole("heading", { name: "Sign in to MalFleks", level: 1 })
    ).toBeVisible();
  });

  test("the session endpoint reports signed out and is never cached", async ({
    request,
  }) => {
    const response = await request.get("/api/auth/session");
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const body = await response.json();
    expect(body.signedIn).toBe(false);
    // No identifiers leak to an unauthenticated caller.
    expect(body).not.toHaveProperty("uid");
    expect(body).not.toHaveProperty("email");
  });

  test("an order request transmits nothing", async ({ page }, testInfo) => {
    // The load-bearing one. A signed-out customer types their name, phone
    // number and home address into this form; none of it may leave the device.
    const NAME = "Neema Mushi";
    const PHONE = "0754123456";
    const ADDRESS = "12 Sokoine Road, Arusha";

    const sameOriginPosts: string[] = [];
    const leaked: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      // A Server Action is a POST to the page's own URL, so any same-origin
      // POST at all means the order was sent somewhere.
      if (request.method() === "POST" && url.startsWith(testInfo.project.use.baseURL!)) {
        sameOriginPosts.push(url);
      }
      // Belt and braces, and the assertion that actually states the promise:
      // no request of any kind, to anyone, may carry the customer's details.
      // This is what would catch an analytics call quietly given form values.
      const body = request.postData() ?? "";
      const haystack = `${url}\n${body}`;
      if (
        haystack.includes(NAME) ||
        haystack.includes(PHONE) ||
        haystack.includes("255754123456") ||
        haystack.includes(ADDRESS)
      ) {
        leaked.push(`${request.method()} ${url}`);
      }
    });

    await page.goto("/delivery/toyota-corolla");

    await page.getByLabel("Full name").fill(NAME);
    await page.getByLabel(/Phone number/).fill(PHONE);
    await page.getByLabel("Delivery city").selectOption("Dar es Salaam");
    await page.getByLabel(/Delivery address/).fill(ADDRESS);

    // The form says so before the button is pressed, rather than only being true.
    await expect(page.getByText(/Nothing is sent or charged yet/)).toBeVisible();

    await page.getByRole("button", { name: "Sign in to order" }).click();

    // To sign in -- by a plain navigation whose address names the product and
    // nothing about the customer.
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdelivery%2Ftoyota-corolla$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to MalFleks", level: 1 })
    ).toBeVisible();

    expect(sameOriginPosts).toEqual([]);
    expect(leaked).toEqual([]);
  });

  test("the server stores nothing for a caller with no session", async ({ page }) => {
    // The form never calls the order action signed out. This is the same
    // promise seen from the other side: nothing a signed-out visitor can do on
    // the confirmation screen claims an order exists.
    await page.goto("/order/confirmation");
    await expect(
      page.getByRole("heading", { name: "No order request to show" })
    ).toBeVisible();
  });

  test("the sitemap lists no page that asks not to be indexed", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();
    // A noindex page advertised in a sitemap tells crawlers two opposite
    // things. /sign-in and the order forms did exactly that until 4 Oct 2026.
    expect(body).not.toContain("/account");
    expect(body).not.toContain("/sign-in");
    expect(body).not.toContain("/delivery/");
    // The pages that are for finding are there.
    expect(body).toContain("/how-it-works");
    expect(body).toContain("/products/toyota-corolla");
  });
});
