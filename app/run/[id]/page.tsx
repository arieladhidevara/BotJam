import { notFound } from "next/navigation";

import RunReplay from "@/components/RunReplay";
import { prisma } from "@/lib/db";
import { serializeDailyChallenge, serializeEvent, serializeRun } from "@/lib/serializers";
import type { CommentDto, EventDto, RunWithChallengeDto } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: { id: string } }) {
  const runId = Number(params.id);
  if (!Number.isInteger(runId) || runId < 1) {
    notFound();
  }

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      dailyChallenge: true
    }
  });

  if (!run) {
    notFound();
  }

  const [eventRows, commentRows] = await Promise.all([
    prisma.event.findMany({
      where: { runId },
      orderBy: { id: "asc" }
    }),
    prisma.comment.findMany({
      where: { runId },
      orderBy: { id: "asc" }
    })
  ]);

  const runDto = {
    ...serializeRun(run),
    dailyChallenge: serializeDailyChallenge(run.dailyChallenge)
  } as RunWithChallengeDto;

  const events = eventRows.map(serializeEvent) as EventDto[];
  const comments = commentRows.map((comment) => ({
    ...comment,
    ts: comment.ts.toISOString()
  })) as CommentDto[];

  return <RunReplay run={runDto} initialEvents={events} initialComments={comments} />;
}
