import { describe, expect, it } from "vitest";

import { redactPrivateUrl } from "./SiteAnalytics";

/**
 * The privacy notice says order references are removed from page addresses
 * before visits are counted. These are the addresses that carry one.
 */
describe("redactPrivateUrl", () => {
  it.each([
    ["https://malfleks.example/pay/ORA-DOD-N6CD", "https://malfleks.example/pay/[reference]"],
    ["https://malfleks.example/track/ORA-DOD-N6CD?from=email", "https://malfleks.example/track/[reference]?from=email"],
    ["https://admin.example/admin/orders/cmu9mnvo0000104l45ottlaiq", "https://admin.example/admin/orders/[id]"],
    ["https://admin.example/admin/partners/cmupwjamd0001wn7doadwvj74", "https://admin.example/admin/partners/[id]"],
    ["https://malfleks.example/sign-in?next=%2Fpay%2FORA-DOD-N6CD", "https://malfleks.example/sign-in?next=[path]"],
  ])("takes the reference out of %s", (url, expected) => {
    expect(redactPrivateUrl(url)).toBe(expected);
  });

  it.each([
    "https://malfleks.example/",
    "https://malfleks.example/products/sub-cmu49j7u7000004jsf6gkkh11",
    "https://malfleks.example/search?q=earbuds&city=Dodoma",
    "https://admin.example/admin/orders",
    "https://admin.example/admin/orders?status=pending",
  ])("leaves a public address alone: %s", (url) => {
    expect(redactPrivateUrl(url)).toBe(url);
  });
});
