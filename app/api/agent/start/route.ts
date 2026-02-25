import { Prisma, RunStatus } from "@prisma/client";

import { authenticateAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { liveHub } from "@/lib/live-hub";
import { serializeDailyChallenge, serializeRun } from "@/lib/serializers";
import { ensureTodayChallenge, getCurrentLiveRun } from "@/lib/server-data";
import { LIMITS, trimAndValidate } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const requestedName = trimAndValidate(body.agentName, LIMITS.agentName);
  const agentName = requestedName ?? auth.agentName;
  const now = new Date();
  const runStartAtMs = Date.now();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const dailyChallenge = await ensureTodayChallenge(tx);

      const run = await tx.run.create({
        data: {
          dailyChallengeId: dailyChallenge.id,
          agentName,
          status: RunStatus.LIVE,
          startedAt: now,
          runStartAtMs: BigInt(runStartAtMs),
          liveSlot: "GLOBAL"
        }
      });

      return { dailyChallenge, run };
    });

    const serializedRun = serializeRun(result.run);
    const serializedChallenge = serializeDailyChallenge(result.dailyChallenge);

    liveHub.broadcast({
      event: "run",
      data: {
        action: "started",
        run: serializedRun,
        dailyChallenge: serializedChallenge
      }
    });

    return Response.json({
      runId: result.run.id,
      dailyChallenge: serializedChallenge,
      run: serializedRun,
      songUrl: result.dailyChallenge.songUrl,
      songDurationMs: result.dailyChallenge.songDurationMs,
      runStartAt: runStartAtMs
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const liveRun = await getCurrentLiveRun();
      return Response.json(
        {
          error: "A live run already exists",
          liveRun: liveRun ? serializeRun(liveRun) : null
        },
        { status: 409 }
      );
    }

    throw error;
  }
}
