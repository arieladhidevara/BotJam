import { prisma } from "@/lib/db";
import { getLikeCountsForRunIds } from "@/lib/likes";
import { serializeRun } from "@/lib/serializers";
import { badRequest } from "@/lib/validation";

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

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      dailyChallenge: true,
      _count: {
        select: { events: true, comments: true }
      }
    }
  });

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const likeCounts = await getLikeCountsForRunIds(prisma, [run.id]);

  return Response.json({
    run: {
      ...serializeRun(run),
      dailyChallenge: {
        ...run.dailyChallenge,
        date: run.dailyChallenge.date.toISOString(),
        createdAt: run.dailyChallenge.createdAt.toISOString()
      },
      counts: {
        ...run._count,
        likes: likeCounts.get(run.id) ?? 0
      }
    }
  });
}
