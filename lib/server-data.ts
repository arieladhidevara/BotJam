import { Prisma, PrismaClient, RunStatus } from "@prisma/client";

import { getTodayUtcDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { resolveSongForDate } from "@/lib/song";

type DbLike = PrismaClient | Prisma.TransactionClient;

const DEFAULT_PROMPT =
  "Jam a small coding experiment that reacts to the song timeline. Keep it clear, playful, and shippable.";

export async function ensureTodayChallenge(db: DbLike = prisma) {
  const today = getTodayUtcDate();
  const song = await resolveSongForDate(today);

  return db.dailyChallenge.upsert({
    where: { date: today },
    create: {
      date: today,
      songTitle: song.songTitle,
      songArtist: song.songArtist,
      songUrl: song.songUrl,
      songDurationMs: song.songDurationMs ?? null,
      prompt: DEFAULT_PROMPT
    },
    update: {
      songTitle: song.songTitle,
      songArtist: song.songArtist,
      songUrl: song.songUrl
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
