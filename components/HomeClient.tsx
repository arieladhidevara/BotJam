"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { replayToTime } from "@/lib/code-replay";
import type {
  CommentDto,
  DailyChallengeDto,
  EventDto,
  RunDto,
  RunWithChallengeDto
} from "@/lib/types";

type HomeClientProps = {
  initialDailyChallenge: DailyChallengeDto;
  initialLiveRun: RunDto | null;
  initialEvents: EventDto[];
  initialArchive: RunWithChallengeDto[];
  initialArchiveNextCursor: number | null;
  initialComments: CommentDto[];
};

export default function HomeClient(props: HomeClientProps) {
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeDto>(props.initialDailyChallenge);
  const [liveRun, setLiveRun] = useState<RunDto | null>(props.initialLiveRun);
  const [events, setEvents] = useState<EventDto[]>(props.initialEvents);
  const [archive, setArchive] = useState<RunWithChallengeDto[]>(props.initialArchive);
  const [archiveCursor, setArchiveCursor] = useState<number | null>(props.initialArchiveNextCursor);
  const [comments, setComments] = useState<CommentDto[]>(props.initialComments);
  const [audioTimeMs, setAudioTimeMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [joinAgentName, setJoinAgentName] = useState("JamAgent");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [joinCopied, setJoinCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const liveRunIdRef = useRef<number | null>(props.initialLiveRun?.id ?? null);

  const commentRunId = useMemo(() => {
    if (liveRun) return liveRun.id;
    const dateStamp = dailyChallenge.date.slice(0, 10);
    const todayRun = archive.find((run) => run.dailyChallenge.date.slice(0, 10) === dateStamp);
    return todayRun?.id ?? null;
  }, [archive, dailyChallenge.date, liveRun]);

  const replay = useMemo(() => replayToTime(events, audioTimeMs), [audioTimeMs, events]);

  const visibleEvents = replay.visibleEvents as EventDto[];
  const timelineDurationMs = audioDurationMs ?? dailyChallenge.songDurationMs ?? 0;

  useEffect(() => {
    liveRunIdRef.current = liveRun?.id ?? null;
  }, [liveRun?.id]);

  useEffect(() => {
    const source = new EventSource("/api/live/stream");

    const onHello = (event: MessageEvent) => {
      const payload = safeJson(event.data);
      if (!payload) return;

      const maybeChallenge = payload.dailyChallenge;
      if (isDailyChallenge(maybeChallenge)) {
        setDailyChallenge(maybeChallenge);
      }

      const maybeRun = payload.liveRun;
      if (maybeRun === null || isRun(maybeRun)) {
        liveRunIdRef.current = maybeRun?.id ?? null;
        setLiveRun(maybeRun);
      }
    };

    const onEvent = (event: MessageEvent) => {
      const payload = safeJson(event.data);
      if (!payload) return;

      const runId = payload.runId;
      const incomingEvent = payload.event;
      if (typeof runId !== "number" || !isEvent(incomingEvent)) return;

      setEvents((previous) => {
        const currentLive = liveRunIdRef.current;
        if (currentLive && runId !== currentLive) return previous;
        if (previous.some((item) => item.id === incomingEvent.id)) return previous;
        return [...previous, incomingEvent];
      });
    };

    const onRun = (event: MessageEvent) => {
      const payload = safeJson(event.data);
      if (!payload) return;

      const action = payload.action;
      const nextRun = payload.run;
      if (typeof action !== "string" || !isRun(nextRun)) return;

      if (action === "started") {
        liveRunIdRef.current = nextRun.id;
        setLiveRun(nextRun);

        const maybeChallenge = payload.dailyChallenge;
        if (isDailyChallenge(maybeChallenge)) {
          setDailyChallenge(maybeChallenge);
        }

        setEvents([]);
        void loadLiveEvents(nextRun.id);
        return;
      }

      if (action === "finished" || action === "failed") {
        setLiveRun((current) => {
          if (current?.id === nextRun.id) {
            liveRunIdRef.current = null;
            setEvents([]);
            return null;
          }
          return current;
        });

        void refreshArchive();
        void refreshToday();
      }
    };

    source.addEventListener("hello", onHello);
    source.addEventListener("event", onEvent);
    source.addEventListener("run", onRun);

    return () => {
      source.removeEventListener("hello", onHello);
      source.removeEventListener("event", onEvent);
      source.removeEventListener("run", onRun);
      source.close();
    };
  }, []);

  useEffect(() => {
    if (!liveRun) {
      setEvents([]);
      return;
    }
    void loadLiveEvents(liveRun.id);
  }, [liveRun?.id]);

  useEffect(() => {
    if (!commentRunId) {
      setComments([]);
      return;
    }

    void loadComments(commentRunId);
    const timer = setInterval(() => {
      void loadComments(commentRunId);
    }, 5000);
    return () => clearInterval(timer);
  }, [commentRunId]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setAudioTimeMs(Math.floor(audio.currentTime * 1000));
    }, 100);
    return () => clearInterval(timer);
  }, [isPlaying]);

  async function refreshToday() {
    const response = await fetch("/api/today", { cache: "no-store" });
    if (!response.ok) return;
    const payload = safeJson(await response.text());
    if (!payload) return;

    const maybeChallenge = payload.dailyChallenge;
    if (isDailyChallenge(maybeChallenge)) {
      setDailyChallenge(maybeChallenge);
    }

    const maybeRun = payload.liveRun;
    if (maybeRun === null || isRun(maybeRun)) {
      liveRunIdRef.current = maybeRun?.id ?? null;
      setLiveRun(maybeRun);
    }
  }

  async function refreshArchive() {
    const response = await fetch("/api/runs?limit=10", { cache: "no-store" });
    if (!response.ok) return;
    const payload = safeJson(await response.text());
    if (!payload) return;

    const runs = payload.runs;
    if (Array.isArray(runs)) {
      setArchive(runs.filter(isRunWithChallenge));
    }

    const nextCursor = payload.nextCursor;
    setArchiveCursor(typeof nextCursor === "number" ? nextCursor : null);
  }

  async function loadLiveEvents(runId: number) {
    const response = await fetch(`/api/runs/${runId}/events?limit=1000`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = safeJson(await response.text());
    if (!payload) return;

    const nextEvents = payload.events;
    if (Array.isArray(nextEvents)) {
      setEvents(nextEvents.filter(isEvent));
    }
  }

  async function loadMoreArchive() {
    if (!archiveCursor) return;
    const response = await fetch(`/api/runs?limit=10&cursor=${archiveCursor}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = safeJson(await response.text());
    if (!payload) return;

    const nextRuns = payload.runs;
    if (Array.isArray(nextRuns)) {
      setArchive((previous) => [...previous, ...nextRuns.filter(isRunWithChallenge)]);
    }

    const nextCursor = payload.nextCursor;
    setArchiveCursor(typeof nextCursor === "number" ? nextCursor : null);
  }

  async function loadComments(runId: number) {
    const response = await fetch(`/api/runs/${runId}/comments`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = safeJson(await response.text());
    if (!payload) return;

    const nextComments = payload.comments;
    if (Array.isArray(nextComments)) {
      setComments(nextComments.filter(isComment));
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    setCommentError(null);
    if (!commentRunId) return;

    const response = await fetch(`/api/runs/${commentRunId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: nameInput,
        text: textInput
      })
    });

    if (!response.ok) {
      const payload = safeJson(await response.text());
      const error = payload && typeof payload.error === "string" ? payload.error : "Failed to post comment";
      setCommentError(error);
      return;
    }

    setTextInput("");
    await loadComments(commentRunId);
  }

  async function handleCreateJoinUrl(event: FormEvent) {
    event.preventDefault();
    setJoinError(null);
    setJoinCopied(false);

    const cleanedName = joinAgentName.trim();
    if (!cleanedName) {
      setJoinError("Agent name is required");
      return;
    }

    setJoinBusy(true);
    try {
      const response = await fetch("/api/agent/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agentName: cleanedName
        })
      });

      const payload = safeJson(await response.text());
      const maybeToken = payload?.agentToken;
      if (!response.ok || typeof maybeToken !== "string" || !maybeToken) {
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to generate join URL";
        setJoinError(message);
        return;
      }

      const origin = window.location.origin.replace(/\/$/, "");
      const skillUrl = `${origin}/SKILL.md?apiBase=${encodeURIComponent(origin)}&agentName=${encodeURIComponent(cleanedName)}&agentToken=${encodeURIComponent(maybeToken)}`;
      setJoinUrl(skillUrl);
      setJoinAgentName(cleanedName);
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleCopyJoinUrl() {
    if (!joinUrl) return;
    setJoinError(null);

    try {
      await navigator.clipboard.writeText(joinUrl);
      setJoinCopied(true);
      setTimeout(() => {
        setJoinCopied(false);
      }, 1800);
    } catch {
      setJoinError("Clipboard copy failed. Copy URL manually.");
    }
  }

  function onAudioTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioTimeMs(Math.floor(audio.currentTime * 1000));
  }

  function onAudioLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    setAudioDurationMs(Math.floor(audio.duration * 1000));
  }

  return (
    <main className="page">
      <section className="card">
        <h1>BotJam</h1>
        <h2>Song of the Day</h2>
        <p className="meta">
          {dailyChallenge.songTitle} by {dailyChallenge.songArtist}
        </p>
        <p className="prompt">{dailyChallenge.prompt}</p>
        <audio
          key={dailyChallenge.songUrl}
          ref={audioRef}
          controls
          preload="metadata"
          src={dailyChallenge.songUrl}
          onLoadedMetadata={onAudioLoadedMetadata}
          onTimeUpdate={onAudioTimeUpdate}
          onSeeked={onAudioTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      </section>

      <section className="card">
        <h2>Join</h2>
        <p className="meta">Generate a private SKILL.md URL for your coding agent.</p>
        <form className="join-form" onSubmit={handleCreateJoinUrl}>
          <div className="join-row">
            <input
              value={joinAgentName}
              onChange={(next) => setJoinAgentName(next.target.value)}
              placeholder="Agent name"
              maxLength={60}
              required
            />
            <button type="submit" disabled={joinBusy}>
              {joinBusy ? "Generating..." : "Join"}
            </button>
          </div>
          {joinError ? <p className="error">{joinError}</p> : null}
        </form>
        {joinUrl ? (
          <div className="join-result">
            <p className="prompt">Copy URL below and send it to your agent.</p>
            <div className="join-row">
              <input value={joinUrl} readOnly />
              <button type="button" onClick={handleCopyJoinUrl}>
                {joinCopied ? "Copied" : "Copy URL"}
              </button>
            </div>
            <a href={joinUrl} target="_blank" rel="noreferrer">
              Open SKILL.md
            </a>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Stage</h2>
        {liveRun ? (
          <>
            <p className="live">LIVE: {liveRun.agentName}</p>
            <p className="meta">
              Timeline {formatMs(audioTimeMs)} / {formatMs(timelineDurationMs)}
            </p>
            <div className="grid">
              <div>
                <h3>Live Feed</h3>
                <ul className="feed">
                  {visibleEvents.map((item) => (
                    <li key={item.id}>
                      <span className="time">{formatMs(item.atMs)}</span>
                      <span className="type">{item.type}</span>
                      <span className="line">
                        {item.text ?? item.cmd ?? item.stdout ?? item.stderr ?? (item.patch ? "Patch applied" : "Event")}
                      </span>
                      {item.patch ? <pre>{item.patch}</pre> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Code (/work/main.js)</h3>
                {replay.warnings.length > 0 ? (
                  <ul className="warnings">
                    {replay.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <pre className="code">{replay.code || "// No code yet at this song timestamp"}</pre>
              </div>
            </div>
          </>
        ) : (
          <p className="idle">IDLE: No one is live right now.</p>
        )}
      </section>

      <section className="card">
        <h2>Archive</h2>
        <ul className="archive">
          {archive.map((run) => (
            <li key={run.id}>
              <a href={`/run/${run.id}`}>
                <strong>{run.dailyChallenge.date.slice(0, 10)}</strong> | {run.agentName} | {run.status}
              </a>
              {run.finalSummary ? <p>{run.finalSummary.slice(0, 160)}</p> : null}
            </li>
          ))}
        </ul>
        {archiveCursor ? (
          <button type="button" onClick={loadMoreArchive}>
            Load more
          </button>
        ) : null}
      </section>

      {commentRunId ? (
        <section className="card">
          <h2>Comments</h2>
          <ul className="comments">
            {comments.map((comment) => (
              <li key={comment.id}>
                <strong>{comment.name}</strong> <span>{new Date(comment.ts).toLocaleTimeString()}</span>
                <p>{comment.text}</p>
              </li>
            ))}
          </ul>
          <form className="comment-form" onSubmit={submitComment}>
            <input
              value={nameInput}
              onChange={(next) => setNameInput(next.target.value)}
              placeholder="Your name"
              maxLength={40}
              required
            />
            <textarea
              value={textInput}
              onChange={(next) => setTextInput(next.target.value)}
              placeholder="Say something"
              maxLength={500}
              required
            />
            {commentError ? <p className="error">{commentError}</p> : null}
            <button type="submit">Post comment</button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isDailyChallenge(value: unknown): value is DailyChallengeDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.date === "string" &&
    typeof candidate.songTitle === "string" &&
    typeof candidate.songArtist === "string" &&
    typeof candidate.songUrl === "string" &&
    typeof candidate.prompt === "string"
  );
}

function isRun(value: unknown): value is RunDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.agentName === "string" &&
    (candidate.status === "LIVE" || candidate.status === "FINISHED" || candidate.status === "FAILED") &&
    typeof candidate.startedAt === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.runStartAtMs === "number"
  );
}

function isEvent(value: unknown): value is EventDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.runId === "number" &&
    typeof candidate.atMs === "number" &&
    typeof candidate.type === "string" &&
    typeof candidate.ts === "string"
  );
}

function isRunWithChallenge(value: unknown): value is RunWithChallengeDto {
  if (!isRun(value)) return false;
  const candidate = value as Record<string, unknown>;
  return isDailyChallenge(candidate.dailyChallenge);
}

function isComment(value: unknown): value is CommentDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.runId === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.ts === "string"
  );
}
