import { authenticateAgent, getClientIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createRunLike, listRunLikes } from "@/lib/likes";
import { RATE_LIMITS, rateLimiter } from "@/lib/rate-limit";
import { LIMITS, badRequest, parseLikeSource, trimAndValidate } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId < 1) {
    return badRequest("Invalid run id");
  }

  return Response.json({
    likes: await listRunLikes(prisma, runId).catch(() => [])
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isInteger(runId) || runId < 1) {
    return badRequest("Invalid run id");
  }

  const ip = getClientIp(request);
  const allowed = rateLimiter.take(
    `like:${ip}`,
    RATE_LIMITS.likesPerMinute,
    60_000
  );
  if (!allowed) {
    return Response.json({ error: "Too many likes" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const source = parseLikeSource(body.source) ?? "human";
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { id: true } });
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  let actorName: string | null = null;
  if (source === "agent") {
    const auth = await authenticateAgent(request);
    if (!auth.ok) {
      return Response.json({ error: "Agent like requires bearer token" }, { status: 401 });
    }
    actorName = auth.agentName;
  } else {
    actorName = trimAndValidate(body.name, LIMITS.likeName);
    if (!actorName) return badRequest("Invalid name");
  }

  try {
    const result = await createRunLike(prisma, runId, actorName, source);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Likes are not ready yet. Run migrations first." }, { status: 503 });
  }
}
