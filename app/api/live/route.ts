import { serializeRun } from "@/lib/serializers";
import { getCurrentLiveRun } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const run = await getCurrentLiveRun();
  return Response.json({
    liveRun: run ? serializeRun(run) : null,
    dailyChallenge: run
      ? {
          ...run.dailyChallenge,
          date: run.dailyChallenge.date.toISOString(),
          createdAt: run.dailyChallenge.createdAt.toISOString()
        }
      : null
  });
}
