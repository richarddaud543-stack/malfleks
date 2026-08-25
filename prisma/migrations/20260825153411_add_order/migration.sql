-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "productId" TEXT,
    "brandId" TEXT,
    "branchId" TEXT,
    "agentId" TEXT,
    "productName" TEXT NOT NULL,
    "unitPriceTZS" INTEGER NOT NULL,
    "brandName" TEXT NOT NULL,
    "brandSlug" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "branchCity" TEXT NOT NULL,
    "branchPhone" TEXT,
    "routeKind" TEXT NOT NULL,
    "routeCarrier" TEXT NOT NULL,
    "routeAgentPhone" TEXT,
    "routeEtaEstimate" TEXT,
    "customerFullName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerAddress" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalTZS" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "DeliveryAgent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_branchId_idx" ON "Order"("branchId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");
