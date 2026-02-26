"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import HydraStage from "@/components/HydraStage";
import { replayToTime } from "@/lib/code-replay";
import type { CommentDto, EventDto, RunWithChallengeDto } from "@/lib/types";

type RunReplayProps = {
  run: RunWithChallengeDto;
  initialEvents: EventDto[];
  initialComments: CommentDto[];
};

export default function RunReplay({ run, initialEvents, initialComments }: RunReplayProps) {
  const [events] = useState<EventDto[]>(initialEvents);
  const [comments, setComments] = useState<CommentDto[]>(initialComments);
  const [audioTimeMs, setAudioTimeMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const replay = useMemo(() => replayToTime(events, audioTimeMs), [audioTimeMs, events]);
  const timelineDurationMs = audioDurationMs ?? run.dailyChallenge.songDurationMs ?? 0;

  useEffect(() => {
    const timer = setInterval(() => {
      void loadComments();
    }, 5000);
    return () => clearInterval(timer);
  }, [run.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setAudioTimeMs(Math.floor(audio.currentTime * 1000));
    }, 100);
    return () => clearInterval(timer);
  }, [isPlaying]);

  async function loadComments() {
    const response = await fetch(`/api/runs/${run.id}/comments`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setComments((payload.comments as CommentDto[]) ?? []);
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    setCommentError(null);

    const response = await fetch(`/api/runs/${run.id}/comments`, {
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
      const payload = await response.json().catch(() => ({}));
      setCommentError((payload.error as string | undefined) ?? "Failed to post comment");
      return;
    }

    setTextInput("");
    await loadComments();
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
        <h1>Run #{run.id}</h1>
        <p className="meta">
          {run.dailyChallenge.songTitle} by {run.dailyChallenge.songArtist}
        </p>
        <p className="meta">
          Agent: {run.agentName} - {run.status}
        </p>
        {run.finalSummary ? <p className="prompt">{run.finalSummary}</p> : null}
        <audio
          key={run.dailyChallenge.songUrl}
          ref={audioRef}
          controls
          preload="metadata"
          src={run.dailyChallenge.songUrl}
          onLoadedMetadata={onAudioLoadedMetadata}
          onTimeUpdate={onAudioTimeUpdate}
          onSeeked={onAudioTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <p className="meta">
          Timeline {formatMs(audioTimeMs)} / {formatMs(timelineDurationMs)}
        </p>
      </section>

      <section className="card">
        <div className="grid">
          <div>
            <h2>Replay Feed</h2>
            <ul className="feed">
              {(replay.visibleEvents as EventDto[]).map((event) => (
                <li key={event.id} className={event.type === "patch" ? "feed-patch" : undefined}>
                  <span className="time">{formatMs(event.atMs)}</span>
                  <span className="type">{event.type}</span>
                  <span className="line">
                    {event.patch
                      ? "Agent patched /work/live.hydra"
                      : event.text ?? event.cmd ?? event.stdout ?? event.stderr ?? "Event"}
                  </span>
                  {event.patch ? <pre>{event.patch}</pre> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Visual Stage (Hydra)</h2>
            <HydraStage code={replay.code} atMs={audioTimeMs} />
            <h2>Code (/work/live.hydra)</h2>
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
      </section>

      <section className="card">
        <h2>All Events</h2>
        <ul className="archive">
          {events.map((event) => (
            <li key={event.id}>
              [{formatMs(event.atMs)}] {event.type} {event.text ?? event.cmd ?? ""}
            </li>
          ))}
        </ul>
      </section>

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
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Your name"
            maxLength={40}
            required
          />
          <textarea
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder="Add a comment"
            maxLength={500}
            required
          />
          {commentError ? <p className="error">{commentError}</p> : null}
          <button type="submit">Post comment</button>
        </form>
      </section>
    </main>
  );
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
