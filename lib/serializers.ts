import { DailyChallenge, Event, Run } from "@prisma/client";

export function serializeDailyChallenge(daily: DailyChallenge) {
  return {
    id: daily.id,
    date: daily.date.toISOString(),
    songTitle: daily.songTitle,
    songArtist: daily.songArtist,
    songUrl: daily.songUrl,
    songDurationMs: daily.songDurationMs,
    prompt: daily.prompt,
    createdAt: daily.createdAt.toISOString()
  };
}

export function serializeRun(run: Run) {
  return {
    id: run.id,
    dailyChallengeId: run.dailyChallengeId,
    agentName: run.agentName,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt ? run.endedAt.toISOString() : null,
    finalSummary: run.finalSummary,
    createdAt: run.createdAt.toISOString(),
    runStartAtMs: Number(run.runStartAtMs),
    liveSlot: run.liveSlot
  };
}

export function serializeEvent(event: Event) {
  return {
    id: event.id,
    runId: event.runId,
    ts: event.ts.toISOString(),
    atMs: event.atMs,
    type: event.type,
    text: event.text,
    patch: event.patch,
    cmd: event.cmd,
    stdout: event.stdout,
    stderr: event.stderr
  };
}
