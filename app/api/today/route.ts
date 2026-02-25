import { prisma } from "@/lib/db";
import { serializeDailyChallenge, serializeRun } from "@/lib/serializers";
import { ensureTodayChallenge, getCurrentLiveRun } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const [dailyChallenge, liveRun] = await Promise.all([ensureTodayChallenge(prisma), getCurrentLiveRun()]);

  return Response.json({
    dailyChallenge: serializeDailyChallenge(dailyChallenge),
    liveRun: liveRun ? serializeRun(liveRun) : null
  });
}
