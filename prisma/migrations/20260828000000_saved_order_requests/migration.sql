
-- CreateTable
CREATE TABLE "SavedOrderRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "SavedOrderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedOrderRequest_customerId_requestedAt_idx" ON "SavedOrderRequest"("customerId", "requestedAt");

-- CreateIndex
CREATE INDEX "SavedOrderRequest_customerId_reference_idx" ON "SavedOrderRequest"("customerId", "reference");

