import { prisma } from "@/lib/db";
import { RATE_LIMITS, rateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth";
import { LIMITS, badRequest, trimAndValidate } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { id: string } }) {
  const runId = Number(context.params.id);
  if (!Number.isInteger(runId) || runId < 1) {
    return badRequest("Invalid run id");
  }

  const comments = await prisma.comment.findMany({
    where: { runId },
    orderBy: { id: "asc" }
  });

  return Response.json({
    comments: comments.map((comment) => ({
      ...comment,
      ts: comment.ts.toISOString()
    }))
  });
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const runId = Number(context.params.id);
  if (!Number.isInteger(runId) || runId < 1) {
    return badRequest("Invalid run id");
  }

  const ip = getClientIp(request);
  const allowed = rateLimiter.take(
    `comment:${ip}`,
    RATE_LIMITS.commentsPerMinute,
    60_000
  );
  if (!allowed) {
    return Response.json({ error: "Too many comments" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const name = trimAndValidate(body.name, LIMITS.commentName);
  const text = trimAndValidate(body.text, LIMITS.commentText);
  if (!name) return badRequest("Invalid name");
  if (!text) return badRequest("Invalid text");

  const run = await prisma.run.findUnique({ where: { id: runId }, select: { id: true } });
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const comment = await prisma.comment.create({
    data: {
      runId,
      name,
      text
    }
  });

  return Response.json({
    comment: {
      ...comment,
      ts: comment.ts.toISOString()
    }
  });
}
