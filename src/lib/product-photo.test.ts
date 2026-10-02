import { describe, expect, it } from "vitest";

import {
  MAX_PRODUCT_PHOTOS,
  canOptimizeProductPhoto,
  isValidProductPhotoUrl,
  normalizeProductPhotoUrls,
  productPhotoList,
  productPhotoPath,
} from "./product-photo";

/**
 * A photo URL is the one field on a listing that makes a customer's browser
 * fetch something. These tests are the list of things that must never be
 * fetched, and the two shapes of row (`photoUrls`, and the older lone
 * `photoUrl`) that must both keep working.
 */

const SUPABASE = "https://project.supabase.co";
const photo = (name: string) =>
  `${SUPABASE}/storage/v1/object/public/product-photos/uid-1/${name}.webp`;

describe("isValidProductPhotoUrl", () => {
  it("accepts a public URL in our own bucket", () => {
    expect(isValidProductPhotoUrl(photo("a"), SUPABASE)).toBe(true);
    // A trailing slash on the configured URL must not break the prefix.
    expect(isValidProductPhotoUrl(photo("a"), `${SUPABASE}/`)).toBe(true);
  });

  it("refuses another host, another bucket, and the bare prefix", () => {
    expect(isValidProductPhotoUrl("https://evil.example/a.jpg", SUPABASE)).toBe(false);
    expect(
      isValidProductPhotoUrl(`${SUPABASE}/storage/v1/object/public/other-bucket/a.jpg`, SUPABASE),
    ).toBe(false);
    expect(
      isValidProductPhotoUrl(`${SUPABASE}/storage/v1/object/public/product-photos/`, SUPABASE),
    ).toBe(false);
    // A host that merely starts with ours.
    expect(
      isValidProductPhotoUrl(
        "https://project.supabase.co.evil.example/storage/v1/object/public/product-photos/a.jpg",
        SUPABASE,
      ),
    ).toBe(false);
  });

  it("refuses everything when Supabase is not configured", () => {
    expect(isValidProductPhotoUrl(photo("a"), "")).toBe(false);
    expect(isValidProductPhotoUrl("/storage/v1/object/public/product-photos/a.jpg", "")).toBe(false);
  });
});

describe("normalizeProductPhotoUrls", () => {
  it("trims, drops blanks and removes repeats, keeping the first one's place", () => {
    expect(
      normalizeProductPhotoUrls([` ${photo("a")} `, "", photo("b"), photo("a")], SUPABASE),
    ).toEqual({ ok: true, urls: [photo("a"), photo("b")] });
  });

  it("fails the whole list on one bad URL rather than dropping it quietly", () => {
    expect(normalizeProductPhotoUrls([photo("a"), "https://evil.example/x.jpg"], SUPABASE)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("allows exactly six and refuses a seventh", () => {
    const many = Array.from({ length: MAX_PRODUCT_PHOTOS + 1 }, (_, i) => photo(`p${i}`));
    expect(normalizeProductPhotoUrls(many.slice(0, MAX_PRODUCT_PHOTOS), SUPABASE).ok).toBe(true);
    expect(normalizeProductPhotoUrls(many, SUPABASE)).toEqual({ ok: false, reason: "too-many" });
  });

  it("counts the limit after removing repeats", () => {
    const repeated = Array.from({ length: 12 }, (_, i) => photo(`p${i % 3}`));
    expect(normalizeProductPhotoUrls(repeated, SUPABASE)).toEqual({
      ok: true,
      urls: [photo("p0"), photo("p1"), photo("p2")],
    });
  });

  it("does not crash on a value that is not a string", () => {
    expect(normalizeProductPhotoUrls([null as never, 7 as never, photo("a")], SUPABASE)).toEqual({
      ok: true,
      urls: [photo("a")],
    });
  });
});

describe("productPhotoList", () => {
  it("returns the list when there is one", () => {
    expect(productPhotoList({ photoUrl: photo("a"), photoUrls: [photo("a"), photo("b")] })).toEqual([
      photo("a"),
      photo("b"),
    ]);
  });

  it("falls back to the lone photoUrl for a row from before the gallery", () => {
    expect(productPhotoList({ photoUrl: photo("a"), photoUrls: [] })).toEqual([photo("a")]);
    expect(productPhotoList({ photoUrl: photo("a") })).toEqual([photo("a")]);
  });

  it("is empty when there is no photo at all", () => {
    expect(productPhotoList({})).toEqual([]);
    expect(productPhotoList({ photoUrl: null, photoUrls: null })).toEqual([]);
    expect(productPhotoList({ photoUrl: "  ", photoUrls: [] })).toEqual([]);
  });
});

describe("productPhotoPath", () => {
  it("gives the object path inside the bucket", () => {
    expect(productPhotoPath(photo("a"), SUPABASE)).toBe("uid-1/a.webp");
  });

  it("is null for a URL that is not ours, so nothing foreign is ever deleted", () => {
    expect(productPhotoPath("https://evil.example/uid-1/a.webp", SUPABASE)).toBeNull();
  });
});

describe("canOptimizeProductPhoto", () => {
  it("allows our bucket and nothing else", () => {
    expect(canOptimizeProductPhoto(photo("a"), SUPABASE)).toBe(true);
    expect(canOptimizeProductPhoto("https://evil.example/a.jpg", SUPABASE)).toBe(false);
  });

  it("is false when the Supabase URL is unknown — tests and bare local builds", () => {
    expect(canOptimizeProductPhoto(photo("a"), "")).toBe(false);
  });

  it("is false for a URL with a query string, which the allow-list does not cover", () => {
    expect(canOptimizeProductPhoto(`${photo("a")}?v=2`, SUPABASE)).toBe(false);
  });
});
