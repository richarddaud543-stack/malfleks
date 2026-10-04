import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";

/**
 * The proxy chooses the language of every shop page. A mistake here is not a
 * wrong word: it is the whole site in the wrong language, or an API call
 * sent to a page.
 */
function ask(path: string, cookie?: string) {
  const request = new NextRequest(`http://shop.test${path}`, {
    headers: { host: "shop.test", ...(cookie ? { cookie } : {}) },
  });
  const response = proxy(request);
  return {
    rewrite: response.headers.get("x-middleware-rewrite"),
    setCookie: response.headers.get("set-cookie"),
  };
}

describe("choosing the language of a page", () => {
  it("serves Swahili to a visitor who has never chosen", () => {
    expect(ask("/search").rewrite).toBe("http://shop.test/sw/search");
    expect(ask("/").rewrite).toBe("http://shop.test/sw");
  });

  it("serves the language the visitor chose", () => {
    expect(ask("/search", "mf_lang=en").rewrite).toBe("http://shop.test/en/search");
    expect(ask("/search", "mf_lang=sw").rewrite).toBe("http://shop.test/sw/search");
  });

  it("ignores a choice that is not a language", () => {
    expect(ask("/search", "mf_lang=fr").rewrite).toBe("http://shop.test/sw/search");
  });

  it("keeps the rest of the address, including what was searched for", () => {
    expect(ask("/search?q=simu&city=Dodoma", "mf_lang=en").rewrite).toBe(
      "http://shop.test/en/search?q=simu&city=Dodoma",
    );
  });

  it("serves an address that names its language as asked, and remembers nothing", () => {
    // Remembering here once turned a Swahili reader's whole site English:
    // the browser fetched a linked `/en/…` page ahead of time, through here.
    for (const path of ["/en/search", "/sw", "/en"]) {
      const answer = ask(path, "mf_lang=sw");
      expect(answer.rewrite, path).toBeNull();
      expect(answer.setCookie, path).toBeNull();
    }
    expect(ask("/en/terms").setCookie).toBeNull();
  });

  it.each([
    "/admin",
    "/admin/orders/abc",
    "/api/auth/session",
    "/api/payments/clickpesa",
    "/auth/callback",
    "/_vercel/insights/view",
    "/_vercel/insights/script.js",
    "/icon/192",
    "/apple-icon",
    "/opengraph-image",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/.well-known/security.txt",
    "/brand-logos/toyota.svg",
  ])("leaves %s alone: it is not a page written in a language", (path) => {
    expect(ask(path).rewrite).toBeNull();
  });
});
