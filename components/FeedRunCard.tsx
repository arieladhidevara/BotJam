"use client";

import { useEffect, useMemo, useState } from "react";

import HydraStage from "@/components/HydraStage";
import { replayToTime } from "@/lib/code-replay";
import type { EventDto, RunWithChallengeDto } from "@/lib/types";

type FeedRunCardProps = {
  run: RunWithChallengeDto;
  onOpen: (run: RunWithChallengeDto) => void;
  onLike: (run: RunWithChallengeDto) => void;
};

export default function FeedRunCard({ run, onOpen, onLike }: FeedRunCardProps) {
  const [hovered, setHovered] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [events, setEvents] = useState<EventDto[] | null>(null);
  const [previewMs, setPreviewMs] = useState(0);
  const songDurationMs = run.dailyChallenge.songDurationMs ?? 40_000;
  const previewDurationMs = Math.max(15_000, Math.min(60_000, songDurationMs));
  const thumbnailMs = Math.max(0, Math.min(30_000, songDurationMs - 800));

  const replay = useMemo(() => replayToTime(events ?? [], previewMs), [events, previewMs]);
  const thumbnailReplay = useMemo(() => replayToTime(events ?? [], thumbnailMs), [events, thumbnailMs]);
  const likes = run.counts?.likes ?? 0;
  const comments = run.counts?.comments ?? 0;

  useEffect(() => {
    if (events || loadingEvents) return;
    setLoadingEvents(true);
    void fetch(`/api/runs/${run.id}/events?limit=1000`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const next = Array.isArray(payload?.events) ? (payload.events as EventDto[]) : [];
        setEvents(next);
      })
      .finally(() => setLoadingEvents(false));
  }, [events, loadingEvents, run.id]);

  useEffect(() => {
    if (!hovered) {
      setPreviewMs(0);
      return;
    }

    const timer = window.setInterval(() => {
      setPreviewMs((current) => {
        const next = current + 120;
        return next > previewDurationMs ? 0 : next;
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [hovered, previewDurationMs]);

  return (
    <article
      className="feed-card"
      onMouseEnter={() => {
        setPreviewMs(0);
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(run)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(run);
        }
      }}
    >
      <div className="feed-preview">
        {events ? (
          <>
            <HydraStage
              code={hovered ? replay.code : thumbnailReplay.code}
              atMs={hovered ? previewMs : thumbnailMs}
            />
            {!hovered ? <span className="feed-preview-tag">ss {formatMs(thumbnailMs)}</span> : null}
          </>
        ) : (
          <div className="feed-preview-placeholder">
            <p>MUTED PREVIEW</p>
            <p>{run.agentName}</p>
          </div>
        )}
      </div>

      <div className="feed-card-body">
        <p className="feed-card-title">{run.agentName}</p>
        <p className="feed-card-meta">{run.dailyChallenge.songTitle}</p>
        <p className="feed-card-meta">
          {run.dailyChallenge.date.slice(0, 10)} #{run.id}
        </p>

        <div className="feed-card-actions">
          <button
            type="button"
            className="like-button"
            onClick={(event) => {
              event.stopPropagation();
              onLike(run);
            }}
          >
            {"\u2764\uFE0F"} {likes}
          </button>
          <span className="feed-card-stat">{"\u{1F4AC}"} {comments}</span>
          <span className="feed-card-stat">{"\u{1F507}"} hover play</span>
        </div>
        {loadingEvents ? <p className="feed-preview-loading">loading preview...</p> : null}
      </div>
    </article>
  );
}

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

