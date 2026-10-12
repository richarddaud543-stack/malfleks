-- Verified shops: when a person at MalFleks checked a shop's documents. 12 Oct 2026.
--
-- Additive only: two nullable columns on an existing table. Nothing existing
-- is dropped, narrowed or rewritten, so this applies to the live database
-- while the old code is still serving -- like the migrations before it.
--
-- Every existing shop reads as "not yet verified", which is the truth: the
-- three shops approved before 9 Oct 2026 never sent documents.

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "documentsVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "documentsVerifiedBy" TEXT;
