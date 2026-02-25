import { prisma } from "@/lib/db";
import { serializeEvent } from "@/lib/serializers";
import { badRequest, parseCursorInt, parsePositiveInt } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: { id: string } }) {
  const runId = Number(context.params.id);
  if (!Number.isInteger(runId) || runId < 1) {
    return badRequest("Invalid run id");
  }

  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get("limit"), 200, 1000);
  const cursor = parseCursorInt(url.searchParams.get("cursor"));

  const events = await prisma.event.findMany({
    where: {
      runId,
      ...(cursor ? { id: { gt: cursor } } : {})
    },
    orderBy: {
      id: "asc"
    },
    take: limit + 1
  });

  const hasMore = events.length > limit;
  const sliced = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

  return Response.json({
    events: sliced.map(serializeEvent),
    nextCursor
  });
}
