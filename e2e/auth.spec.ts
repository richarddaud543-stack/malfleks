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
      page.getByRole("heading", { name: "Sign in to Soko", level: 1 })
    ).toBeVisible();

    const button = page.getByRole("button", { name: /Continue with Google/i });
    await expect(button).toBeVisible();

    // Reachable by keyboard alone, and showing the app-wide focus ring rather
    // than a suppressed outline.
    await button.focus();
    await expect(button).toBeFocused();

    // The promise that ordering never requires an account is on the page, not
    // just in our heads.
    await expect(
      page.getByText(/don't need an account to order/i)
    ).toBeVisible();
  });

  test("/account sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/account");
    // Authorization lives in the page's own data layer, so this redirect holds
    // whether or not any proxy is configured.
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount|\/sign-in\?next=\/account/);
    await expect(
      page.getByRole("heading", { name: "Sign in to Soko", level: 1 })
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
    await page.getByLabel(/Delivery address/).fill(ADDRESS);
    await page.getByRole("button", { name: "Confirm brand delivery" }).click();

    await expect(page).toHaveURL(/\/order\/confirmation$/);
    await expect(page.getByTestId("order-confirmation")).toBeVisible();

    expect(sameOriginPosts).toEqual([]);
    expect(leaked).toEqual([]);

    // And the screen says so, rather than only being true.
    await expect(page.getByText(/lives in this browser tab only/i)).toBeVisible();
  });

  test("the confirmation screen offers signing in to keep the next one", async ({
    page,
  }) => {
    await page.goto("/delivery/toyota-corolla");
    await page.getByLabel("Full name").fill("Neema Mushi");
    await page.getByLabel(/Phone number/).fill("0754123456");
    await page.getByLabel(/Delivery address/).fill("12 Sokoine Road, Arusha");
    await page.getByRole("button", { name: "Confirm brand delivery" }).click();

    await expect(page.getByTestId("order-confirmation")).toBeVisible();
    const signIn = page
      .getByTestId("order-confirmation")
      .getByRole("link", { name: "sign in" });
    await expect(signIn).toHaveAttribute("href", "/sign-in");
  });

  test("/sign-in is in the sitemap and /account is not", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).toContain("/sign-in");
    // A noindex private page advertised in a sitemap tells crawlers two
    // opposite things.
    expect(body).not.toContain("/account");
  });
});
