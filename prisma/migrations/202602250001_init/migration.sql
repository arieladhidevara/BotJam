-- Create enums
CREATE TYPE "RunStatus" AS ENUM ('LIVE', 'FINISHED', 'FAILED');
CREATE TYPE "EventType" AS ENUM ('status', 'patch', 'cmd', 'output', 'error', 'marker');

-- Create tables
CREATE TABLE "DailyChallenge" (
  "id" SERIAL NOT NULL,
  "date" DATE NOT NULL,
  "songTitle" TEXT NOT NULL,
  "songArtist" TEXT NOT NULL,
  "songUrl" TEXT NOT NULL,
  "songDurationMs" INTEGER,
  "prompt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Run" (
  "id" SERIAL NOT NULL,
  "dailyChallengeId" INTEGER NOT NULL,
  "agentName" TEXT NOT NULL,
  "status" "RunStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "finalSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "runStartAtMs" BIGINT NOT NULL,
  "liveSlot" TEXT,
  CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atMs" INTEGER NOT NULL,
  "type" "EventType" NOT NULL,
  "text" TEXT,
  "patch" TEXT,
  "cmd" TEXT,
  "stdout" TEXT,
  "stderr" TEXT,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentToken" (
  "id" SERIAL NOT NULL,
  "agentName" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "AgentToken_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX "DailyChallenge_date_key" ON "DailyChallenge"("date");
CREATE INDEX "DailyChallenge_createdAt_idx" ON "DailyChallenge"("createdAt");

CREATE UNIQUE INDEX "Run_liveSlot_key" ON "Run"("liveSlot");
CREATE INDEX "Run_status_startedAt_idx" ON "Run"("status", "startedAt");
CREATE INDEX "Run_dailyChallengeId_startedAt_idx" ON "Run"("dailyChallengeId", "startedAt");

CREATE INDEX "Event_runId_id_idx" ON "Event"("runId", "id");
CREATE INDEX "Event_runId_atMs_idx" ON "Event"("runId", "atMs");

CREATE INDEX "Comment_runId_id_idx" ON "Comment"("runId", "id");

CREATE UNIQUE INDEX "AgentToken_tokenHash_key" ON "AgentToken"("tokenHash");
CREATE INDEX "AgentToken_createdAt_idx" ON "AgentToken"("createdAt");

-- Add foreign keys
ALTER TABLE "Run"
  ADD CONSTRAINT "Run_dailyChallengeId_fkey"
  FOREIGN KEY ("dailyChallengeId") REFERENCES "DailyChallenge"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
