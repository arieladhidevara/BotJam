import { RunStatus } from "@prisma/client";

import HomeClient from "@/components/HomeClient";
import { prisma } from "@/lib/db";
import { getLikeCountsForRunIds } from "@/lib/likes";
import { serializeDailyChallenge, serializeEvent, serializeRun } from "@/lib/serializers";
import { ensureTodayChallenge } from "@/lib/server-data";
import type { CommentDto, EventDto, RunWithChallengeDto } from "@/lib/types";

export const dynamic = "force-dynamic";

const ARCHIVE_PAGE_SIZE = 10;

export default async function HomePage() {
  const dailyChallenge = await ensureTodayChallenge();

  const [liveRun, archiveRows] = await Promise.all([
    prisma.run.findFirst({
      where: { status: RunStatus.LIVE },
      orderBy: { startedAt: "desc" }
    }),
    prisma.run.findMany({
      where: {
        status: {
          not: RunStatus.LIVE
        }
      },
      orderBy: { id: "desc" },
      include: {
        dailyChallenge: true,
        _count: {
          select: {
            events: true,
            comments: true
          }
        }
      },
      take: ARCHIVE_PAGE_SIZE + 1
    })
  ]);

  const hasMoreArchive = archiveRows.length > ARCHIVE_PAGE_SIZE;
  const archiveSlice = hasMoreArchive ? archiveRows.slice(0, ARCHIVE_PAGE_SIZE) : archiveRows;
  const nextArchiveCursor = hasMoreArchive ? archiveSlice[archiveSlice.length - 1]?.id ?? null : null;
  const likeCounts = await getLikeCountsForRunIds(prisma, archiveSlice.map((row) => row.id));

  const archive: RunWithChallengeDto[] = archiveSlice.map((row) => ({
    ...serializeRun(row),
    dailyChallenge: serializeDailyChallenge(row.dailyChallenge),
    counts: {
      ...row._count,
      likes: likeCounts.get(row.id) ?? 0
    }
  }));

  const commentRunId = liveRun
    ? liveRun.id
    : archive.find((run) => run.dailyChallengeId === dailyChallenge.id)?.id ?? null;

  const [initialEventsRows, initialCommentRows] = await Promise.all([
    liveRun
      ? prisma.event.findMany({
          where: { runId: liveRun.id },
          orderBy: { id: "asc" }
        })
      : Promise.resolve([]),
    commentRunId
      ? prisma.comment.findMany({
          where: { runId: commentRunId },
          orderBy: { id: "asc" }
        })
      : Promise.resolve([])
  ]);

  const initialEvents = initialEventsRows.map(serializeEvent) as EventDto[];
  const initialComments = initialCommentRows.map((comment) => ({
    ...comment,
    ts: comment.ts.toISOString()
  })) as CommentDto[];

  return (
    <HomeClient
      initialDailyChallenge={serializeDailyChallenge(dailyChallenge)}
      initialLiveRun={liveRun ? serializeRun(liveRun) : null}
      initialEvents={initialEvents}
      initialArchive={archive}
      initialArchiveNextCursor={nextArchiveCursor}
      initialComments={initialComments}
    />
  );
}
