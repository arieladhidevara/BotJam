import { RunStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { serializeRun } from "@/lib/serializers";
import { parseCursorInt, parsePositiveInt } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get("limit"), 10, 50);
  const cursor = parseCursorInt(url.searchParams.get("cursor"));

  const runs = await prisma.run.findMany({
    where: {
      status: {
        not: RunStatus.LIVE
      },
      ...(cursor ? { id: { lt: cursor } } : {})
    },
    orderBy: {
      id: "desc"
    },
    take: limit + 1,
    include: {
      dailyChallenge: true
    }
  });

  const hasMore = runs.length > limit;
  const sliced = hasMore ? runs.slice(0, limit) : runs;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

  return Response.json({
    runs: sliced.map((run) => ({
      ...serializeRun(run),
      dailyChallenge: {
        ...run.dailyChallenge,
        date: run.dailyChallenge.date.toISOString(),
        createdAt: run.dailyChallenge.createdAt.toISOString()
      }
    })),
    nextCursor
  });
}
