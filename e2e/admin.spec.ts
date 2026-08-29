import { test, expect } from "@playwright/test";

/**
 * The admin review queue, from the outside.
 *
 * Same constraint as `auth.spec.ts`: driving a real Google sign-in here would
 * mean automating Google's consent screen against a credential this repo must
 * not hold, and an `admin: true` flag in `app_metadata` can only be set through
 * Supabase's Admin API. So this file covers what *is* testable end to end — the
 * signed-out path, which is also the one where a mistake would let anyone see
 * partner applications, not just the wrong subset of them.
 *
 * The signed-in non-admin path (`notFound()`) and the signed-in admin path are
 * covered nowhere at E2E altitude. `admin.test.ts` covers the authorization
 * rule in isolation and `requireAdmin` wires it up, but nothing here proves
 * the wiring — that gap is worth naming rather than pretending it is closed.
 */

test.describe("admin, signed out", () => {
  test("/admin sends a signed-out visitor to sign in, never the queue", async ({
    page,
  }) => {
    await page.goto("/admin");

    // Authorization lives in requireAdmin() in the DAL, not a proxy — this
    // redirect holds whether or not any proxy is configured, same reasoning
    // as the /account case in auth.spec.ts.
    await expect(page).toHaveURL(
      /\/sign-in\?next=%2Fadmin|\/sign-in\?next=\/admin/
    );
    await expect(
      page.getByRole("heading", { name: "Sign in to Soko", level: 1 })
    ).toBeVisible();

    // Belt and braces: the queue itself must not be in the DOM at all, not
    // just hidden behind the redirect.
    await expect(
      page.getByRole("heading", { name: "Partner applications" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(
      0
    );
  });

  test("/admin is absent from the sitemap, like the other private pages", async ({
    request,
  }) => {
    // A 404-for-non-admins page is worth less to an attacker who cannot tell
    // it exists — requireAdmin()'s own reasoning, restated here as the
    // sitemap policy that has to match it. /apply is the positive control:
    // present, because it is the one page in this file that must be findable.
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).not.toContain("/admin");
    expect(body).toContain("/apply");
  });
});
