import { RunStatus } from "@prisma/client";

import { authenticateAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { liveHub } from "@/lib/live-hub";
import { serializeEvent, serializeRun } from "@/lib/serializers";
import { LIMITS, badRequest, trimAndValidate } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const runId = Number(body.runId);
  if (!Number.isInteger(runId) || runId < 1) return badRequest("Invalid runId");

  const reason = trimAndValidate(body.reason, LIMITS.eventText);
  if (!reason) return badRequest("Invalid reason");

  const result = await prisma.$transaction(async (tx) => {
    const run = await tx.run.findUnique({
      where: { id: runId },
      include: { dailyChallenge: true }
    });

    if (!run || run.status !== RunStatus.LIVE) {
      return null;
    }

    const nowMs = Date.now();
    const elapsed = Math.max(0, Math.floor(nowMs - Number(run.runStartAtMs)));
    const atMs = run.dailyChallenge.songDurationMs == null
      ? elapsed
      : Math.min(elapsed, run.dailyChallenge.songDurationMs);

    const updatedRun = await tx.run.update({
      where: { id: run.id },
      data: {
        status: RunStatus.FAILED,
        endedAt: new Date(),
        finalSummary: reason,
        liveSlot: null
      }
    });

    const errorEvent = await tx.event.create({
      data: {
        runId: run.id,
        atMs,
        type: "error",
        text: reason,
        stderr: reason
      }
    });

    return { run: updatedRun, errorEvent };
  });

  if (!result) {
    return Response.json({ error: "Run is not live or missing" }, { status: 409 });
  }

  const serializedRun = serializeRun(result.run);
  const serializedEvent = serializeEvent(result.errorEvent);

  liveHub.broadcast({
    event: "event",
    data: {
      runId: result.run.id,
      event: serializedEvent
    }
  });

  liveHub.broadcast({
    event: "run",
    data: {
      action: "failed",
      run: serializedRun
    }
  });

  return Response.json({
    run: serializedRun,
    errorEvent: serializedEvent
  });
}
