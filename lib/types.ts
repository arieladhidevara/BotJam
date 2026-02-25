export type DailyChallengeDto = {
  id: number;
  date: string;
  songTitle: string;
  songArtist: string;
  songUrl: string;
  songDurationMs: number | null;
  prompt: string;
  createdAt: string;
};

export type RunDto = {
  id: number;
  dailyChallengeId: number;
  agentName: string;
  status: "LIVE" | "FINISHED" | "FAILED";
  startedAt: string;
  endedAt: string | null;
  finalSummary: string | null;
  createdAt: string;
  runStartAtMs: number;
  liveSlot: string | null;
};

export type RunWithChallengeDto = RunDto & {
  dailyChallenge: DailyChallengeDto;
};

export type EventDto = {
  id: number;
  runId: number;
  ts: string;
  atMs: number;
  type: "status" | "patch" | "cmd" | "output" | "error" | "marker";
  text: string | null;
  patch: string | null;
  cmd: string | null;
  stdout: string | null;
  stderr: string | null;
};

export type CommentDto = {
  id: number;
  runId: number;
  ts: string;
  name: string;
  text: string;
};
