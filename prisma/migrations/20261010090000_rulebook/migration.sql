-- The rulebook: rules that act when the owner is not there. 10 Oct 2026.
--
-- Additive only. One nullable column on an existing table and four new
-- tables; nothing existing is dropped, narrowed or rewritten, so this applies
-- to the live database while the old code is still serving -- exactly like
-- the two migrations before it.
--
-- See the note above `RuleRun` in prisma/schema.prisma for what each table is
-- for, and src/server/rules/ for the rules themselves.

-- AlterTable
ALTER TABLE "OrderPayment" ADD COLUMN     "payerPhone" TEXT;

-- CreateTable
CREATE TABLE "RuleRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "acted" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "results" JSONB NOT NULL,

    CONSTRAINT "RuleRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleMark" (
    "ruleKey" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleMark_pkey" PRIMARY KEY ("ruleKey","subjectId")
);

-- CreateTable
CREATE TABLE "OwnerAlert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "openKey" TEXT,
    "urgency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),
    "textedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "OwnerAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundSend" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "openOrderId" TEXT,
    "amountTZS" INTEGER NOT NULL,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sendRef" TEXT,
    "providerRef" TEXT,
    "feeTZS" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendStartedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "failureNote" TEXT,

    CONSTRAINT "RefundSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RuleRun_startedAt_idx" ON "RuleRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerAlert_openKey_key" ON "OwnerAlert"("openKey");

-- CreateIndex
CREATE INDEX "OwnerAlert_status_createdAt_idx" ON "OwnerAlert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OwnerAlert_key_createdAt_idx" ON "OwnerAlert"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundSend_openOrderId_key" ON "RefundSend"("openOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundSend_sendRef_key" ON "RefundSend"("sendRef");

-- CreateIndex
CREATE INDEX "RefundSend_orderId_idx" ON "RefundSend"("orderId");

-- CreateIndex
CREATE INDEX "RefundSend_status_idx" ON "RefundSend"("status");

-- AddForeignKey
ALTER TABLE "RefundSend" ADD CONSTRAINT "RefundSend_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table in this schema: the app reaches Postgres as the
-- owner over DATABASE_URL and never through Supabase's anon key. With row
-- level security on and no policies, nothing but the server can read these --
-- and `RefundSend` holds customers' wallet numbers.
ALTER TABLE "RuleRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RuleMark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerAlert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundSend" ENABLE ROW LEVEL SECURITY;
