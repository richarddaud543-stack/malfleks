-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedBy" TEXT,
ADD COLUMN     "statusNote" TEXT;

-- AlterTable
ALTER TABLE "PayoutBatch" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "paidBy" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hiddenAt" TIMESTAMP(3);
