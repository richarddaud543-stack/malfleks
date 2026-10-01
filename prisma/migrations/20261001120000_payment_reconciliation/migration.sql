-- AlterTable
ALTER TABLE "OrderPayment" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "providerStatus" TEXT;
