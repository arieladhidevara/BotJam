import { RunStatus } from "@prisma/client";

import { authenticateAgent } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { liveHub } from "@/lib/live-hub";
import { RATE_LIMITS, rateLimiter } from "@/lib/rate-limit";
import { serializeEvent } from "@/lib/serializers";
import {
  LIMITS,
  badRequest,
  maybeString,
  parseEventType
} from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth.ok) return auth.response;

  const isAllowed = rateLimiter.take(
    `event:${auth.tokenHash}`,
    RATE_LIMITS.eventsPerMinutePerToken,
    60_000
  );
  if (!isAllowed) {
    return Response.json({ error: "Too many events" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const runId = Number(body.runId);
  if (!Number.isInteger(runId) || runId < 1) return badRequest("Invalid runId");

  const atMs = Number(body.atMs);
  if (!Number.isInteger(atMs) || atMs < 0) return badRequest("Invalid atMs");

  const type = parseEventType(body.type);
  if (!type) return badRequest("Invalid event type");

  const text = maybeString(body.text, LIMITS.eventText);
  const patch = maybeString(body.patch, LIMITS.eventPatch);
  const cmd = maybeString(body.cmd, LIMITS.eventCmd);
  const stdout = maybeString(body.stdout, LIMITS.eventOutput);
  const stderr = maybeString(body.stderr, LIMITS.eventOutput);

  if (body.text != null && text == null) return badRequest("Invalid text");
  if (body.patch != null && patch == null) return badRequest("Invalid patch");
  if (body.cmd != null && cmd == null) return badRequest("Invalid cmd");
  if (body.stdout != null && stdout == null) return badRequest("Invalid stdout");
  if (body.stderr != null && stderr == null) return badRequest("Invalid stderr");

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { dailyChallenge: true }
  });

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== RunStatus.LIVE) {
    return Response.json({ error: "Run is not live" }, { status: 409 });
  }

  if (run.dailyChallenge.songDurationMs != null && atMs > run.dailyChallenge.songDurationMs) {
    return badRequest("atMs exceeds song duration");
  }

  const event = await prisma.event.create({
    data: {
      runId,
      atMs,
      type,
      text,
      patch,
      cmd,
      stdout,
      stderr
    }
  });

  const serialized = serializeEvent(event);
  liveHub.broadcast({
    event: "event",
    data: {
      runId,
      event: serialized
    }
  });

  return Response.json({ event: serialized });
}
