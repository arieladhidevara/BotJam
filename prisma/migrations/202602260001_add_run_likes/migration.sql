-- Create enum
CREATE TYPE "LikeSource" AS ENUM ('human', 'agent');

-- Create table
CREATE TABLE "RunLike" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" TEXT NOT NULL,
  "source" "LikeSource" NOT NULL DEFAULT 'human',
  CONSTRAINT "RunLike_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX "RunLike_runId_source_name_key" ON "RunLike"("runId", "source", "name");
CREATE INDEX "RunLike_runId_id_idx" ON "RunLike"("runId", "id");

-- Add foreign key
ALTER TABLE "RunLike"
  ADD CONSTRAINT "RunLike_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
