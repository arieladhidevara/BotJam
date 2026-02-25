import { Prisma, PrismaClient, RunStatus } from "@prisma/client";

import { getTodayUtcDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { resolvePromptForDate, resolveSongForDate } from "@/lib/song";

type DbLike = PrismaClient | Prisma.TransactionClient;

export async function ensureTodayChallenge(db: DbLike = prisma) {
  const today = getTodayUtcDate();
  const song = await resolveSongForDate(today);
  const prompt = resolvePromptForDate(today);

  return db.dailyChallenge.upsert({
    where: { date: today },
    create: {
      date: today,
      songTitle: song.songTitle,
      songArtist: song.songArtist,
      songUrl: song.songUrl,
      songDurationMs: song.songDurationMs ?? null,
      prompt
    },
    update: {
      songTitle: song.songTitle,
      songArtist: song.songArtist,
      songUrl: song.songUrl,
      songDurationMs: song.songDurationMs ?? null,
      prompt
    }
  });
}

export async function getCurrentLiveRun() {
  return prisma.run.findFirst({
    where: { status: RunStatus.LIVE },
    include: { dailyChallenge: true },
    orderBy: { startedAt: "desc" }
  });
}
