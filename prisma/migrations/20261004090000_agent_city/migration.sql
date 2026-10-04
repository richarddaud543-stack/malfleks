-- The agents' city: rank and pause per agent, every shift worked, what the
-- agents have been taught, and what they have asked the owner.
-- Additive only: four new tables, nothing existing is touched.

CREATE TABLE "AgentState" (
    "agentKey" TEXT NOT NULL,
    "rank" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentState_pkey" PRIMARY KEY ("agentKey")
);

CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentLesson" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "helpRequestId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentHelpRequest" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "context" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentHelpRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_agentKey_startedAt_idx" ON "AgentRun"("agentKey", "startedAt");
CREATE INDEX "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");
CREATE UNIQUE INDEX "AgentLesson_helpRequestId_key" ON "AgentLesson"("helpRequestId");
CREATE INDEX "AgentLesson_active_agentKey_idx" ON "AgentLesson"("active", "agentKey");
CREATE UNIQUE INDEX "AgentHelpRequest_agentKey_topic_key" ON "AgentHelpRequest"("agentKey", "topic");
CREATE INDEX "AgentHelpRequest_status_createdAt_idx" ON "AgentHelpRequest"("status", "createdAt");

-- The same lock every other table here has: the browser-facing API roles get
-- nothing. Only the server's own connection reads or writes these.
ALTER TABLE "AgentState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentLesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentHelpRequest" ENABLE ROW LEVEL SECURITY;
