-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUid" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT,
    "branchId" TEXT,
    "brandId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceTZS" INTEGER NOT NULL,
    "image" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "decisionNote" TEXT,
    "publishedProductId" TEXT
);

-- CreateTable
CREATE TABLE "ProductSubmissionSpec" (
    "submissionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    PRIMARY KEY ("submissionId", "key"),
    CONSTRAINT "ProductSubmissionSpec_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ProductSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSubmission_publishedProductId_key" ON "ProductSubmission"("publishedProductId");

-- CreateIndex
CREATE INDEX "ProductSubmission_status_createdAt_idx" ON "ProductSubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductSubmission_partnerId_idx" ON "ProductSubmission"("partnerId");

-- CreateIndex
CREATE INDEX "ProductSubmissionSpec_submissionId_position_idx" ON "ProductSubmissionSpec"("submissionId", "position");
