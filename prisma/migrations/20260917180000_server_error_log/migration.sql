-- CreateTable
CREATE TABLE "ServerErrorLog" (
    "id" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "uid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerErrorLog_createdAt_idx" ON "ServerErrorLog"("createdAt");

-- CreateIndex
CREATE INDEX "ServerErrorLog_context_createdAt_idx" ON "ServerErrorLog"("context", "createdAt");
