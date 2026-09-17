-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "quoteGoodsRungTZS" INTEGER,
ADD COLUMN     "quoteDeliveryFeeTZS" INTEGER,
ADD COLUMN     "quoteDeliveryRungTZS" INTEGER,
ADD COLUMN     "quoteDepositTZS" INTEGER,
ADD COLUMN     "quoteDoorPaymentTZS" INTEGER,
ADD COLUMN     "quoteOrderTotalTZS" INTEGER;
