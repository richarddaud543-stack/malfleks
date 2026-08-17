-- Replaces the prose `etaEstimate` column with a comparable day range, so
-- couriers can be ranked ("who is fastest in this city") rather than only
-- displayed. The label is derived at render time by `formatEta()`.
--
-- Prisma's generated version of this migration copied the surviving columns
-- and left the two new NOT NULL ones unset, which fails on any non-empty
-- table. The SELECT below translates the existing strings instead, so this
-- runs against a seeded database as well as an empty one.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "etaMinDays" INTEGER NOT NULL,
    "etaMaxDays" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL
);
INSERT INTO "new_DeliveryAgent" ("city", "id", "name", "phone", "sortOrder", "verified", "etaMinDays", "etaMaxDays")
SELECT "city", "id", "name", "phone", "sortOrder", "verified",
    CASE
        WHEN "etaEstimate" LIKE 'Same-day%' THEN 0
        WHEN "etaEstimate" LIKE '1 day%' THEN 1
        WHEN "etaEstimate" LIKE '1%2 day%' THEN 1
        -- Anything unrecognised becomes the slowest quote we ever wrote (1-2
        -- days) rather than the fastest: an over-promise reaches a customer,
        -- an under-promise only looks pessimistic in an admin view.
        ELSE 1
    END,
    CASE
        WHEN "etaEstimate" LIKE 'Same-day%' THEN 0
        WHEN "etaEstimate" LIKE '1 day%' THEN 1
        WHEN "etaEstimate" LIKE '1%2 day%' THEN 2
        ELSE 2
    END
FROM "DeliveryAgent";
DROP TABLE "DeliveryAgent";
ALTER TABLE "new_DeliveryAgent" RENAME TO "DeliveryAgent";
CREATE INDEX "DeliveryAgent_city_idx" ON "DeliveryAgent"("city");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
