-- AlterTable
ALTER TABLE "Order" ADD COLUMN "decidedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "decidedBy" TEXT;
ALTER TABLE "Order" ADD COLUMN "decisionNote" TEXT;
