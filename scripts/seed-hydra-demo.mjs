import { PrismaClient, RunStatus } from "@prisma/client";

const prisma = new PrismaClient();

const HYDRA_AGENT_NAME = "HydraDemoBot";

async function main() {
  const today = getTodayUtcDate();

  const challenge = await prisma.dailyChallenge.findUnique({
    where: { date: today }
  });

  if (!challenge) {
    throw new Error(
      "No DailyChallenge found for today. Open the app once so today's challenge is created, then run this script again."
    );
  }

  const run = await prisma.run.create({
    data: {
      dailyChallengeId: challenge.id,
      agentName: HYDRA_AGENT_NAME,
      status: RunStatus.FINISHED,
      startedAt: new Date(),
      endedAt: new Date(),
      finalSummary: "Hydra demo run for timeline playback test",
      runStartAtMs: BigInt(Date.now() - 1000),
      liveSlot: null
    }
  });

  const patchIntro = [
    "--- a/work/live.hydra",
    "+++ b/work/live.hydra",
    "@@ -1,0 +1,7 @@",
    "+setResolution(1280, 720)",
    "+speed = 0.6",
    "+osc(6, 0.04, 0.8)",
    "+  .color(0.2, 0.6, 1.0)",
    "+  .rotate(() => time * 0.03)",
    "+  .out(o0)",
    "+render(o0)"
  ].join("\n");

  const patchDrop = [
    "--- a/work/live.hydra",
    "+++ b/work/live.hydra",
    "@@ -1,7 +1,9 @@",
    "-setResolution(1280, 720)",
    "-speed = 0.6",
    "-osc(6, 0.04, 0.8)",
    "-  .color(0.2, 0.6, 1.0)",
    "-  .rotate(() => time * 0.03)",
    "-  .out(o0)",
    "-render(o0)",
    "+setResolution(1280, 720)",
    "+speed = 0.72",
    "+osc(9, 0.06, 0.9)",
    "+  .mult(osc(3, 0.02, 0.7).kaleid(4))",
    "+  .color(0.9, 0.25, 1.0)",
    "+  .modulate(noise(4), 0.12)",
    "+  .rotate(() => time * 0.08)",
    "+  .out(o0)",
    "+render(o0)"
  ].join("\n");

  const patchBreakdown = [
    "--- a/work/live.hydra",
    "+++ b/work/live.hydra",
    "@@ -1,9 +1,8 @@",
    "-setResolution(1280, 720)",
    "-speed = 0.72",
    "-osc(9, 0.06, 0.9)",
    "-  .mult(osc(3, 0.02, 0.7).kaleid(4))",
    "-  .color(0.9, 0.25, 1.0)",
    "-  .modulate(noise(4), 0.12)",
    "-  .rotate(() => time * 0.08)",
    "-  .out(o0)",
    "-render(o0)",
    "+setResolution(1280, 720)",
    "+speed = 0.68",
    "+shape(3, 0.45, 0.002)",
    "+  .color(0.15, 0.95, 0.7)",
    "+  .modulate(osc(8, 0.02, 1.2), 0.18)",
    "+  .scrollX(() => Math.sin(time * 0.4) * 0.08)",
    "+  .out(o0)",
    "+render(o0)"
  ].join("\n");

  await prisma.event.createMany({
    data: [
      {
        runId: run.id,
        atMs: 0,
        type: "patch",
        patch: patchIntro
      },
      {
        runId: run.id,
        atMs: 1200,
        type: "status",
        text: "Plan: 00:05 intro pulse, 00:22 beat drop, 00:40 breakdown."
      },
      {
        runId: run.id,
        atMs: 22000,
        type: "patch",
        patch: patchDrop
      },
      {
        runId: run.id,
        atMs: 22900,
        type: "status",
        text: "Drop moment: increase density and color contrast."
      },
      {
        runId: run.id,
        atMs: 40000,
        type: "patch",
        patch: patchBreakdown
      },
      {
        runId: run.id,
        atMs: 40900,
        type: "status",
        text: "Breakdown: simplify shape and slow movement."
      }
    ]
  });

  console.log(
    [
      "Hydra demo run created.",
      `runId=${run.id}`,
      `dailyChallengeId=${challenge.id}`,
      "Refresh homepage to see the demo in stage replay."
    ].join(" ")
  );
}

function getTodayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
