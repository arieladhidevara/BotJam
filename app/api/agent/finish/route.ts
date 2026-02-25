import { RunStatus } from "@prisma/client";

import { authenticateAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { liveHub } from "@/lib/live-hub";
import { serializeRun } from "@/lib/serializers";
import { LIMITS, badRequest, maybeString } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const runId = Number(body.runId);
  if (!Number.isInteger(runId) || runId < 1) return badRequest("Invalid runId");

  const finalSummary = maybeString(body.finalSummary, LIMITS.finalSummary);
  if (body.finalSummary != null && finalSummary == null) return badRequest("Invalid finalSummary");

  const updated = await prisma.run.updateMany({
    where: { id: runId, status: RunStatus.LIVE },
    data: {
      status: RunStatus.FINISHED,
      endedAt: new Date(),
      finalSummary: finalSummary ?? null,
      liveSlot: null
    }
  });

  if (updated.count === 0) {
    return Response.json({ error: "Run is not live or missing" }, { status: 409 });
  }

  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) {
    return Response.json({ error: "Run not found after update" }, { status: 404 });
  }

  const serializedRun = serializeRun(run);
  liveHub.broadcast({
    event: "run",
    data: {
      action: "finished",
      run: serializedRun
    }
  });

  return Response.json({ run: serializedRun });
}
