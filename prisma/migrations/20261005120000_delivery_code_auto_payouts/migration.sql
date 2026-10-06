-- Delivery confirmed by a code the customer holds, and payouts MalFleks can
-- send itself.
-- Additive only: two new tables and three nullable columns. Nothing existing
-- is rewritten, and every existing order and payout reads exactly as before.

CREATE TABLE "DeliveryCode" (
    "orderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "smsSentAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "problemAt" TIMESTAMP(3),
    "problemBy" TEXT,
    "problemNote" TEXT,

    CONSTRAINT "DeliveryCode_pkey" PRIMARY KEY ("orderId")
);

CREATE INDEX "DeliveryCode_problemAt_idx" ON "DeliveryCode"("problemAt");

ALTER TABLE "DeliveryCode" ADD CONSTRAINT "DeliveryCode_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "PayoutBatch" ADD COLUMN "sendRef" TEXT;
ALTER TABLE "PayoutBatch" ADD COLUMN "sendStartedAt" TIMESTAMP(3);
ALTER TABLE "PayoutBatch" ADD COLUMN "feeTZS" INTEGER;

CREATE UNIQUE INDEX "PayoutBatch_sendRef_key" ON "PayoutBatch"("sendRef");

-- Supabase exposes `public` over its data API. Every other table here has row
-- level security on with no policies, so only the server (the `postgres` role,
-- over DATABASE_URL) can read it. The delivery code must be no different.
ALTER TABLE "DeliveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSetting" ENABLE ROW LEVEL SECURITY;
