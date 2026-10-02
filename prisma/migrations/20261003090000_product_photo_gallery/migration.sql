-- Several photos per product (the gallery). Additive only: every existing row
-- gets an empty list, and "photoUrl" stays as the main photo, so nothing that
-- reads the old column changes behaviour.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProductSubmission" ADD COLUMN     "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
