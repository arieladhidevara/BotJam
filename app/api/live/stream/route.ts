import { liveHub } from "@/lib/live-hub";
import { serializeDailyChallenge, serializeRun } from "@/lib/serializers";
import { ensureTodayChallenge, getCurrentLiveRun } from "@/lib/server-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let clientId = -1;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientId = liveHub.addClient(controller);

      void (async () => {
        const [dailyChallenge, liveRun] = await Promise.all([ensureTodayChallenge(), getCurrentLiveRun()]);
        liveHub.send(clientId, {
          event: "hello",
          data: {
            dailyChallenge: serializeDailyChallenge(dailyChallenge),
            liveRun: liveRun ? serializeRun(liveRun) : null
          }
        });
      })();

      keepAlive = setInterval(() => {
        liveHub.sendKeepAlive(clientId);
      }, 15000);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      if (clientId !== -1) liveHub.removeClient(clientId);
    }
  });

  request.signal.addEventListener("abort", () => {
    if (keepAlive) clearInterval(keepAlive);
    if (clientId !== -1) liveHub.removeClient(clientId);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
