-- AlterTable
ALTER TABLE "PartnerApplication" ADD COLUMN "decisionNote" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN "reviewedBy" TEXT;

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "displayName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "brandId" TEXT,
    "address" TEXT,
    "branchId" TEXT,
    "agentId" TEXT,
    "applicationId" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PartnerUser" (
    "uid" TEXT NOT NULL PRIMARY KEY,
    "partnerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerUser_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Partner_applicationId_key" ON "Partner"("applicationId");

-- CreateIndex
CREATE INDEX "Partner_kind_status_idx" ON "Partner"("kind", "status");

-- CreateIndex
CREATE INDEX "PartnerUser_partnerId_idx" ON "PartnerUser"("partnerId");
