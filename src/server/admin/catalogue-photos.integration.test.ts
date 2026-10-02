// @vitest-environment node
//
// Real Postgres, like `console.integration.test.ts` beside it: what matters
// about an admin removing a photo is what the shop then shows, and whether
// two operators working on the same listing can undo each other — neither of
// which a mocked client can answer.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/db/client";
import { seedDatabase } from "@/server/db/seed";
import { createTestDatabase, type TestDatabase } from "@/server/db/test-database";
import { getProductById } from "@/server/repositories";
import {
  removeProductPhoto,
  searchCatalogue,
  setMainProductPhoto,
  withMainPhoto,
  withoutPhoto,
} from "./catalogue";

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase("admin_catalogue_photos");
  await seedDatabase(getPrisma());
}, 180_000);

afterAll(async () => {
  await db.teardown();
});

const photo = (name: string) =>
  `https://project.supabase.co/storage/v1/object/public/product-photos/uid-1/${name}.webp`;

const A = photo("front");
const B = photo("back");
const C = photo("scratch");

/** Gives a seeded product a known set of photos. */
async function withPhotos(productId: string, photos: string[]) {
  await getPrisma().product.update({
    where: { id: productId },
    data: { photoUrls: photos, photoUrl: photos[0] ?? null },
  });
}

async function stored(productId: string) {
  return getPrisma().product.findUniqueOrThrow({
    where: { id: productId },
    select: { photoUrl: true, photoUrls: true },
  });
}

describe("withoutPhoto / withMainPhoto — pure", () => {
  it("removes one photo and keeps the rest in order", () => {
    expect(withoutPhoto([A, B, C], B)).toEqual([A, C]);
  });

  it("moves the chosen photo to the front and keeps the rest in order", () => {
    expect(withMainPhoto([A, B, C], C)).toEqual([C, A, B]);
    expect(withMainPhoto([A, B, C], A)).toEqual([A, B, C]);
  });

  it("answers null for a photo that is not on the product", () => {
    expect(withoutPhoto([A, B], C)).toBeNull();
    expect(withMainPhoto([A, B], C)).toBeNull();
  });
});

describe("removeProductPhoto", () => {
  it("takes one photo off, and the shop stops showing it", async () => {
    await withPhotos("toyota-corolla", [A, B, C]);

    await expect(removeProductPhoto("toyota-corolla", B)).resolves.toEqual({ ok: true });

    expect(await stored("toyota-corolla")).toEqual({ photoUrl: A, photoUrls: [A, C] });
    const shown = await getProductById("toyota-corolla");
    expect(shown?.photoUrls).toEqual([A, C]);
  });

  it("promotes the next photo when the main one is removed", async () => {
    await withPhotos("toyota-corolla", [A, B, C]);

    await expect(removeProductPhoto("toyota-corolla", A)).resolves.toEqual({ ok: true });

    expect(await stored("toyota-corolla")).toEqual({ photoUrl: B, photoUrls: [B, C] });
  });

  it("leaves the product with its icon when the last photo goes", async () => {
    await withPhotos("toyota-corolla", [A]);

    await expect(removeProductPhoto("toyota-corolla", A)).resolves.toEqual({ ok: true });

    expect(await stored("toyota-corolla")).toEqual({ photoUrl: null, photoUrls: [] });
    const shown = await getProductById("toyota-corolla");
    // Still on the shop — only the photo is gone.
    expect(shown).toBeDefined();
    expect(shown?.photoUrl).toBeUndefined();
    expect(shown?.photoUrls).toBeUndefined();
  });

  it("works on a row from before the gallery, which has only the single column", async () => {
    await getPrisma().product.update({
      where: { id: "toyota-corolla" },
      data: { photoUrl: A, photoUrls: [] },
    });

    await expect(removeProductPhoto("toyota-corolla", A)).resolves.toEqual({ ok: true });

    expect(await stored("toyota-corolla")).toEqual({ photoUrl: null, photoUrls: [] });
  });

  it("says so when the photo is not on the product, and changes nothing", async () => {
    await withPhotos("toyota-corolla", [A, B]);

    await expect(removeProductPhoto("toyota-corolla", C)).resolves.toEqual({
      ok: false,
      reason: "no-such-photo",
    });
    expect(await stored("toyota-corolla")).toEqual({ photoUrl: A, photoUrls: [A, B] });
  });

  it("says so when the product does not exist", async () => {
    await expect(removeProductPhoto("no-such-product", A)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("setMainProductPhoto", () => {
  it("moves the chosen photo first and keeps `photoUrl` in step with it", async () => {
    await withPhotos("toyota-corolla", [A, B, C]);

    await expect(setMainProductPhoto("toyota-corolla", C)).resolves.toEqual({ ok: true });

    expect(await stored("toyota-corolla")).toEqual({ photoUrl: C, photoUrls: [C, A, B] });
    const shown = await getProductById("toyota-corolla");
    expect(shown?.photoUrl).toBe(C);
  });

  it("refuses a photo that is not on the product, so a main photo cannot be smuggled in", async () => {
    await withPhotos("toyota-corolla", [A, B]);

    await expect(
      setMainProductPhoto("toyota-corolla", "https://evil.example/x.jpg"),
    ).resolves.toEqual({ ok: false, reason: "no-such-photo" });
    expect(await stored("toyota-corolla")).toEqual({ photoUrl: A, photoUrls: [A, B] });
  });
});

describe("two operators on the same listing", () => {
  it("never bring a removed photo back: one change lands and the other is told to look again", async () => {
    await withPhotos("toyota-corolla", [A, B, C]);

    // Both read [A, B, C]. One removes C; the other makes C the main photo.
    // Without the guard in the WHERE the second write would be computed from
    // the stale list and put C back on the shop.
    const outcomes = await Promise.all([
      removeProductPhoto("toyota-corolla", C),
      setMainProductPhoto("toyota-corolla", C),
    ]);

    const row = await stored("toyota-corolla");
    const landed = outcomes.filter((o) => o.ok).length;
    expect(landed).toBeGreaterThanOrEqual(1);

    if (landed === 1) {
      // The loser was refused, for one of the two honest reasons.
      const loser = outcomes.find((o) => !o.ok);
      expect(loser && !loser.ok && ["changed", "no-such-photo"]).toContain(
        loser && !loser.ok ? loser.reason : "",
      );
    }
    // Whatever the order, the row is one of the two coherent results — never
    // a mix — and the main photo is always the first of the list.
    expect([
      [A, B],
      [C, A, B],
    ]).toContainEqual(row.photoUrls);
    expect(row.photoUrl).toBe(row.photoUrls[0]);
  });
});

describe("searchCatalogue", () => {
  it("lists each product's photos, main one first, and an empty list when it has none", async () => {
    await withPhotos("toyota-corolla", [B, A]);

    const { rows } = await searchCatalogue({ q: "Corolla" });
    const corolla = rows.find((r) => r.id === "toyota-corolla");
    expect(corolla?.photos).toEqual([B, A]);

    const other = rows.find((r) => r.id !== "toyota-corolla");
    expect(other?.photos).toEqual([]);
  });
});
