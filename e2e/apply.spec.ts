import { test, expect } from "@playwright/test";

/**
 * The partner intake page.
 *
 * Every case here runs **signed out**, because that is the state a brand
 * arrives in and the one thing this page must get right: it has to be findable
 * and readable by someone with no MalFleks account, and it must not show them a
 * form they cannot submit. The signed-in path needs real Admin credentials,
 * which `docs/auth.md` records as the project's largest untested seam — so it
 * is covered by the component test instead of pretended at here.
 */
test.describe("partner application", () => {
  test("is reachable from the footer of any page", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Become a partner" })
      .click();

    await expect(page).toHaveURL(/\/apply$/);
    await expect(
      page.getByRole("heading", { name: /become a malfleks partner/i, level: 1 })
    ).toBeVisible();
  });

  test("explains the steps before asking anyone to sign in", async ({ page }) => {
    await page.goto("/apply");

    // The three-step explainer is the part a signed-out visitor can actually
    // read, so it has to render without a session.
    //
    // Scoped to the headings rather than matched as free text: "You apply" also
    // occurs inside the sign-in card's prose ("the account you apply with…"),
    // and a bare getByText raced the session fetch — one match before the card
    // rendered, two after. That read as flakiness and was a strict-mode
    // violation waiting for the slower run.
    for (const step of ["You apply", "We check it by hand", "You're set up"]) {
      await expect(
        page.getByRole("heading", { name: step, level: 2 })
      ).toBeVisible();
    }
  });

  test("offers sign-in rather than a form nobody could submit", async ({ page }) => {
    await page.goto("/apply");

    const signIn = page.getByRole("link", { name: /sign in to continue/i });
    await expect(signIn).toBeVisible();
    // Returning to /apply afterwards is the whole point of the parameter.
    await expect(signIn).toHaveAttribute("href", "/sign-in?next=/apply");

    await expect(
      page.getByRole("button", { name: /send application/i })
    ).toHaveCount(0);
  });

  test("is listed in the sitemap, unlike the private pages", async ({ request }) => {
    // /apply is indexable on purpose: a brand that cannot find it cannot apply.
    // /account is deliberately absent, and this asserts both halves so the two
    // policies cannot quietly swap.
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).toContain("/apply");
    expect(body).not.toContain("/account");
  });
});
