"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import FeedRunCard from "@/components/FeedRunCard";
import HydraStage from "@/components/HydraStage";
import { replayToTime } from "@/lib/code-replay";
import type {
  CommentDto,
  DailyChallengeDto,
  EventDto,
  LikeDto,
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

type AgentSummary = {
  name: string;
  runs: number;
  isLive: boolean;
  lastStatus: "LIVE" | "FINISHED" | "FAILED" | null;
};

const AGENT_PREFIX = ["Neon", "Pixel", "Turbo", "Echo", "Circuit", "Nova", "Drift", "Pulse"];
const AGENT_SUFFIX = ["Bot", "Runner", "Synth", "Signal", "Node", "Wave", "Glitch", "Machine"];
const ICON = {
  red: "\u{1F534}",
  yellow: "\u{1F7E1}",
  green: "\u{1F7E2}",
  white: "\u26AA",
  date: "\u{1F5D3}",
  timer: "\u23F1",
  headphones: "\u{1F3A7}",
  monitor: "\u{1F5A5}",
  robot: "\u{1F916}",
  updates: "\u{1F4E1}",
  brain: "\u{1F9E0}",
  note: "\u{1F3B5}",
  lowVolume: "\u{1F508}",
  link: "\u{1F517}",
  dice: "\u{1F3B2}",
  plus: "\u2795",
  check: "\u2705",
  clipboard: "\u{1F4CB}",
  doc: "\u{1F4C4}",
  chat: "\u{1F4AC}",
  person: "\u{1F464}",
  write: "\u270D\uFE0F",
  send: "\u{1F4E8}",
  archive: "\u{1F39E}",
  feed: "\u{1F4F0}",
  heart: "\u2764\uFE0F",
  unmute: "\u{1F50A}",
  mute: "\u{1F507}",
  close: "\u274C",
  play: "\u25B6\uFE0F",
  down: "\u2B07\uFE0F",
  speaker: "\u{1F50A}",
  pause: "\u23F8",
  patch: "\u{1F9E9}",
  status: "\u{1F4A1}",
  cmd: "\u2328\uFE0F",
  output: "\u{1F4E4}",
  error: "\u26A0\uFE0F",
  marker: "\u{1F4CD}",
  sparkle: "\u2728"
} as const;

export default function HomeClient(props: HomeClientProps) {
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeDto>(props.initialDailyChallenge);
  const [liveRun, setLiveRun] = useState<RunDto | null>(props.initialLiveRun);
  const [events, setEvents] = useState<EventDto[]>(props.initialEvents);
  const [archive, setArchive] = useState<RunWithChallengeDto[]>(props.initialArchive);
  const [archiveCursor, setArchiveCursor] = useState<number | null>(props.initialArchiveNextCursor);
  const [comments, setComments] = useState<CommentDto[]>(props.initialComments);
  const [stageLikes, setStageLikes] = useState<LikeDto[]>([]);
  const [audioTimeMs, setAudioTimeMs] = useState(0);
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null);
  const [stageStartMs, setStageStartMs] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [nameInput, setNameInput] = useState<string>(() => createViewerName());
  const [textInput, setTextInput] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [stageLikeError, setStageLikeError] = useState<string | null>(null);
  const [joinAgentName, setJoinAgentName] = useState<string>(() => createAgentName());
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [joinCopied, setJoinCopied] = useState(false);
  const [stageSideHeightPx, setStageSideHeightPx] = useState<number | null>(null);
  const [viewerName, setViewerName] = useState<string>(() => createViewerName());
  const [likeError, setLikeError] = useState<string | null>(null);
  const [modalRun, setModalRun] = useState<RunWithChallengeDto | null>(null);
  const [modalEvents, setModalEvents] = useState<EventDto[]>([]);
  const [modalComments, setModalComments] = useState<CommentDto[]>([]);
  const [modalLikes, setModalLikes] = useState<LikeDto[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalAudioTimeMs, setModalAudioTimeMs] = useState(0);
  const [modalAudioDurationMs, setModalAudioDurationMs] = useState<number | null>(null);
  const [modalNameInput, setModalNameInput] = useState("");
  const [modalTextInput, setModalTextInput] = useState("");
  const [modalCommentError, setModalCommentError] = useState<string | null>(null);
  const [modalLikeError, setModalLikeError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement | null>(null);
  const liveRunIdRef = useRef<number | null>(props.initialLiveRun?.id ?? null);
  const stageMutedForFeedModalRef = useRef(false);

  const stageDate = dailyChallenge.date.slice(0, 10);
  const stagedRun = useMemo(() => {
    if (liveRun) return null;
    return archive.find(
      (run) => run.dailyChallenge.date.slice(0, 10) === stageDate && run.status === "FINISHED"
    ) ?? null;
  }, [archive, liveRun, stageDate]);

  const commentRunId = useMemo(() => {
    if (liveRun) return liveRun.id;
    if (stagedRun) return stagedRun.id;
    const todayRun = archive.find((run) => run.dailyChallenge.date.slice(0, 10) === stageDate);
    return todayRun?.id ?? null;
  }, [archive, liveRun, stagedRun, stageDate]);

  const activeRun = liveRun ?? stagedRun;
  const replay = useMemo(() => replayToTime(events, audioTimeMs), [audioTimeMs, events]);
  const visibleEvents = replay.visibleEvents as EventDto[];
  const timelineDurationMs = dailyChallenge.songDurationMs ?? audioDurationMs ?? 0;
  const stageFeed = useMemo(() => visibleEvents.slice(-18), [visibleEvents]);
  const modalReplay = useMemo(() => replayToTime(modalEvents, modalAudioTimeMs), [modalAudioTimeMs, modalEvents]);
  const modalTimelineMs = modalAudioDurationMs ?? modalRun?.dailyChallenge.songDurationMs ?? 0;

  const audioNote = liveRun
    ? `${ICON.speaker} LIVE playback`
    : stagedRun
      ? `${ICON.speaker} one-shot replay`
      : `${ICON.pause} no live playback yet`;

  const agentRoster = useMemo(() => {
    const map = new Map<string, AgentSummary>();

    const addRun = (name: string, status: "LIVE" | "FINISHED" | "FAILED", isLive: boolean) => {
      const current = map.get(name);
      if (!current) {
        map.set(name, {
          name,
          runs: 1,
          isLive,
          lastStatus: isLive ? "LIVE" : status
        });
        return;
      }

      current.runs += 1;
      current.isLive = current.isLive || isLive;
      if (isLive) {
        current.lastStatus = "LIVE";
      } else if (current.lastStatus !== "LIVE") {
        current.lastStatus = status;
      }
    };

    if (liveRun) {
      addRun(liveRun.agentName, liveRun.status, liveRun.status === "LIVE");
    }
    for (const run of archive) {
      addRun(run.agentName, run.status, false);
    }

    return [...map.values()].sort(
      (a, b) => Number(b.isLive) - Number(a.isLive) || b.runs - a.runs || a.name.localeCompare(b.name)
    );
  }, [archive, liveRun]);
  const onlineAgentCount = useMemo(
    () => agentRoster.reduce((count, agent) => count + (agent.isLive ? 1 : 0), 0),
    [agentRoster]
  );

  useEffect(() => {
    liveRunIdRef.current = liveRun?.id ?? null;
  }, [liveRun?.id]);

  useEffect(() => {
    const element = stageFrameRef.current;
    if (!element) {
      setStageSideHeightPx(null);
      return;
    }

    const updateHeight = () => {
      if (window.innerWidth <= 980) {
        setStageSideHeightPx(null);
        return;
      }
      const next = Math.max(0, Math.floor(element.getBoundingClientRect().height));
      setStageSideHeightPx((current) => (current === next ? current : next));
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("botjam_viewer_name");
    if (saved && saved.trim()) {
      setViewerName(saved.trim().slice(0, 40));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("botjam_viewer_name", viewerName);
  }, [viewerName]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!modalRun) {
      document.body.classList.remove("modal-open");
      return;
    }

    document.body.classList.add("modal-open");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modalRun]);

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
        if (!currentLive || runId !== currentLive) return previous;
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

        setStageStartMs(null);
        setAudioTimeMs(0);
        setEvents([]);
        void loadRunEvents(nextRun.id);
        return;
      }

      if (action === "finished" || action === "failed") {
        setLiveRun((current) => {
          if (current?.id === nextRun.id) {
            liveRunIdRef.current = null;
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
    if (!activeRun) {
      setEvents([]);
      return;
    }
    void loadRunEvents(activeRun.id);
  }, [activeRun?.id]);

  useEffect(() => {
    if (liveRun) {
      setStageStartMs(liveRun.runStartAtMs);
      return;
    }

    if (!stagedRun) {
      setStageStartMs(null);
      setAudioTimeMs(0);
      return;
    }

    setStageStartMs(Date.now());
    setAudioTimeMs(0);
  }, [liveRun?.id, liveRun?.runStartAtMs, stagedRun?.id]);

  useEffect(() => {
    if (!activeRun || stageStartMs == null) return;

    const updateClock = () => {
      const elapsed = Math.max(0, Date.now() - stageStartMs);
      const bounded = timelineDurationMs > 0 ? Math.min(elapsed, timelineDurationMs) : elapsed;
      setAudioTimeMs(bounded);
    };

    updateClock();
    const timer = window.setInterval(updateClock, 120);
    return () => window.clearInterval(timer);
  }, [activeRun?.id, stageStartMs, timelineDurationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!activeRun || stageStartMs == null) {
      audio.pause();
      seekAudio(audio, 0);
      setAudioBlocked(false);
      return;
    }

    const initialElapsed = Math.max(0, Date.now() - stageStartMs);
    const initialBounded = timelineDurationMs > 0 ? Math.min(initialElapsed, timelineDurationMs) : initialElapsed;
    seekAudio(audio, initialBounded / 1000);

    const tryPlay = async () => {
      try {
        await audio.play();
        setAudioBlocked(false);
      } catch {
        setAudioBlocked(true);
      }
    };

    void tryPlay();

    const syncTimer = window.setInterval(() => {
      const elapsed = Math.max(0, Date.now() - stageStartMs);
      const bounded = timelineDurationMs > 0 ? Math.min(elapsed, timelineDurationMs) : elapsed;
      const expectedSeconds = bounded / 1000;
      const drift = Math.abs(audio.currentTime - expectedSeconds);

      if (drift > 0.8) {
        seekAudio(audio, expectedSeconds);
      }

      const nearEnd = timelineDurationMs > 0 && bounded >= timelineDurationMs - 120;
      if (audio.paused && !nearEnd) {
        void tryPlay();
      }
    }, 1000);

    return () => window.clearInterval(syncTimer);
  }, [activeRun?.id, stageStartMs, dailyChallenge.songUrl, timelineDurationMs]);

  useEffect(() => {
    if (!commentRunId) {
      setComments([]);
      setStageLikes([]);
      return;
    }

    void loadStageSocial(commentRunId);
    const timer = setInterval(() => {
      void loadStageSocial(commentRunId);
    }, 5000);
    return () => clearInterval(timer);
  }, [commentRunId]);

  useEffect(() => {
    if (!modalRun) return;
    void loadModalData(modalRun.id);
    const timer = setInterval(() => {
      void loadModalSocial(modalRun.id);
    }, 6000);
    return () => clearInterval(timer);
  }, [modalRun?.id]);

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

  async function loadRunEvents(runId: number) {
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

  async function loadStageSocial(runId: number) {
    const [commentsResponse, likesResponse] = await Promise.all([
      fetch(`/api/runs/${runId}/comments`, { cache: "no-store" }),
      fetch(`/api/runs/${runId}/likes`, { cache: "no-store" })
    ]);
    if (!commentsResponse.ok || !likesResponse.ok) return;

    const commentsPayload = safeJson(await commentsResponse.text());
    const likesPayload = safeJson(await likesResponse.text());
    if (!commentsPayload || !likesPayload) return;

    const nextComments = Array.isArray(commentsPayload.comments)
      ? commentsPayload.comments.filter(isComment)
      : [];
    const nextLikes = Array.isArray(likesPayload.likes) ? likesPayload.likes.filter(isLike) : [];
    setComments(nextComments);
    setStageLikes(nextLikes);
  }

  async function loadModalData(runId: number) {
    setModalLoading(true);
    try {
      const [eventsResponse, commentsResponse, likesResponse] = await Promise.all([
        fetch(`/api/runs/${runId}/events?limit=1000`, { cache: "no-store" }),
        fetch(`/api/runs/${runId}/comments`, { cache: "no-store" }),
        fetch(`/api/runs/${runId}/likes`, { cache: "no-store" })
      ]);

      const eventsPayload = eventsResponse.ok ? safeJson(await eventsResponse.text()) : null;
      const commentsPayload = commentsResponse.ok ? safeJson(await commentsResponse.text()) : null;
      const likesPayload = likesResponse.ok ? safeJson(await likesResponse.text()) : null;

      const nextEvents = Array.isArray(eventsPayload?.events) ? eventsPayload.events.filter(isEvent) : [];
      const nextComments = Array.isArray(commentsPayload?.comments)
        ? commentsPayload.comments.filter(isComment)
        : [];
      const nextLikes = Array.isArray(likesPayload?.likes) ? likesPayload.likes.filter(isLike) : [];

      setModalEvents(nextEvents);
      setModalComments(nextComments);
      setModalLikes(nextLikes);
      setArchive((previous) =>
        previous.map((run) =>
          run.id === runId
            ? {
                ...run,
                counts: {
                  events: nextEvents.length,
                  comments: nextComments.length,
                  likes: nextLikes.length
                }
              }
            : run
        )
      );
    } finally {
      setModalLoading(false);
    }
  }

  async function loadModalSocial(runId: number) {
    const [commentsResponse, likesResponse] = await Promise.all([
      fetch(`/api/runs/${runId}/comments`, { cache: "no-store" }),
      fetch(`/api/runs/${runId}/likes`, { cache: "no-store" })
    ]);
    if (!commentsResponse.ok || !likesResponse.ok) return;

    const commentsPayload = safeJson(await commentsResponse.text());
    const likesPayload = safeJson(await likesResponse.text());
    if (!commentsPayload || !likesPayload) return;

    const nextComments = Array.isArray(commentsPayload.comments)
      ? commentsPayload.comments.filter(isComment)
      : [];
    const nextLikes = Array.isArray(likesPayload.likes) ? likesPayload.likes.filter(isLike) : [];
    setModalComments(nextComments);
    setModalLikes(nextLikes);
    syncRunCounts(runId, nextComments.length, nextLikes.length);
  }

  async function submitLike(run: RunWithChallengeDto, source: "human" | "agent" = "human") {
    setLikeError(null);
    setModalLikeError(null);
    const name = source === "human" ? resolveViewerName(viewerName) : viewerName;
    const response = await fetch(`/api/runs/${run.id}/likes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        source
      })
    });

    const payload = safeJson(await response.text());
    if (!response.ok) {
      const message = payload && typeof payload.error === "string" ? payload.error : "Failed to like";
      setLikeError(message);
      if (modalRun?.id === run.id) {
        setModalLikeError(message);
      }
      return;
    }

    const like = payload?.like;
    const duplicate = Boolean(payload?.duplicate);
    if (!duplicate && isLike(like)) {
      setModalLikes((previous) => {
        if (previous.some((item) => item.id === like.id)) return previous;
        return [like, ...previous];
      });
      syncRunCounts(run.id, undefined, undefined, true);
    }
  }

  function syncRunCounts(
    runId: number,
    commentsCount?: number,
    likesCount?: number,
    likeIncrement?: boolean
  ) {
    setArchive((previous) =>
      previous.map((run) => {
        if (run.id !== runId) return run;
        const currentComments = run.counts?.comments ?? 0;
        const currentLikes = run.counts?.likes ?? 0;
        return {
          ...run,
          counts: {
            events: run.counts?.events ?? 0,
            comments: commentsCount ?? currentComments,
            likes: likesCount ?? (likeIncrement ? currentLikes + 1 : currentLikes)
          }
        };
      })
    );
  }

  function openFeedModal(run: RunWithChallengeDto) {
    setModalRun(run);
    setModalEvents([]);
    setModalComments([]);
    setModalLikes([]);
    setModalAudioTimeMs(0);
    setModalAudioDurationMs(null);
    setModalCommentError(null);
    setModalLikeError(null);
    setModalNameInput(viewerName);
    setModalTextInput("");
  }

  function closeModal() {
    restoreLiveStageAudioAfterFeedModal();
    setModalRun(null);
    setModalEvents([]);
    setModalComments([]);
    setModalLikes([]);
    setModalAudioTimeMs(0);
    setModalAudioDurationMs(null);
    const audio = modalAudioRef.current;
    if (audio) {
      audio.pause();
      seekAudio(audio, 0);
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
    await loadStageSocial(commentRunId);
  }

  async function submitStageLike() {
    setStageLikeError(null);
    if (!commentRunId) return;

    const response = await fetch(`/api/runs/${commentRunId}/likes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: resolveViewerName(viewerName),
        source: "human"
      })
    });

    const payload = safeJson(await response.text());
    if (!response.ok) {
      const message = payload && typeof payload.error === "string" ? payload.error : "Failed to like";
      setStageLikeError(message);
      return;
    }

    if (payload?.duplicate) {
      return;
    }

    const like = payload?.like;
    if (isLike(like)) {
      setStageLikes((previous) => {
        if (previous.some((item) => item.id === like.id)) return previous;
        return [like, ...previous];
      });
      return;
    }

    await loadStageSocial(commentRunId);
  }

  async function submitModalComment(event: FormEvent) {
    event.preventDefault();
    setModalCommentError(null);
    if (!modalRun) return;

    const response = await fetch(`/api/runs/${modalRun.id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: modalNameInput.trim() || resolveViewerName(viewerName),
        text: modalTextInput
      })
    });

    const payload = safeJson(await response.text());
    if (!response.ok) {
      const error = payload && typeof payload.error === "string" ? payload.error : "Failed to post comment";
      setModalCommentError(error);
      return;
    }

    const comment = payload?.comment;
    if (isComment(comment)) {
      setModalComments((previous) => {
        const next = [...previous, comment];
        syncRunCounts(modalRun.id, next.length);
        return next;
      });
    } else {
      await loadModalSocial(modalRun.id);
    }
    setModalTextInput("");
  }

  async function handleStageUnmute() {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setAudioBlocked(false);
    } catch {
      setAudioBlocked(true);
    }
  }

  function onModalAudioLoadedMetadata() {
    const audio = modalAudioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    setModalAudioDurationMs(Math.floor(audio.duration * 1000));
  }

  function onModalAudioPlay() {
    muteLiveStageAudioForFeedModal();
  }

  function onModalAudioTimeUpdate() {
    const audio = modalAudioRef.current;
    if (!audio) return;
    setModalAudioTimeMs(Math.floor(audio.currentTime * 1000));
  }

  function muteLiveStageAudioForFeedModal() {
    if (!liveRun) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.muted) return;
    audio.muted = true;
    stageMutedForFeedModalRef.current = true;
  }

  function restoreLiveStageAudioAfterFeedModal() {
    if (!stageMutedForFeedModalRef.current) return;
    const audio = audioRef.current;
    if (audio) {
      audio.muted = false;
    }
    stageMutedForFeedModalRef.current = false;
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

  function onAudioLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    setAudioDurationMs(Math.floor(audio.duration * 1000));
  }

  return (
    <main className="page jam-page">
      <section className="card stage-hero">
        <div className="hero-top">
          <h1 className="hero-title">BOTJAM</h1>
        </div>

        {liveRun ? (
          <div className="hero-badges">
            <span className="badge is-live">{ICON.red} LIVE! {liveRun.agentName} is performing</span>
          </div>
        ) : null}
        <p className="track-meta">{dailyChallenge.songArtist}</p>

        <div className="stage-layout">
          <div className="stage-main-stack">
            <div className="stage-main">
              <div className="stage-frame" ref={stageFrameRef}>
                {activeRun ? (
                  <HydraStage code={replay.code} atMs={audioTimeMs} />
                ) : (
                  <div className="stage-placeholder">
                    {!liveRun ? <p>{ICON.robot} Main Stage is available!</p> : null}
                  </div>
                )}
                {audioBlocked && activeRun ? (
                  <button type="button" className="unmute-cta" onClick={handleStageUnmute}>
                    {ICON.unmute} UNMUTE STAGE AUDIO
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="stage-side" style={stageSideHeightPx ? { height: `${stageSideHeightPx}px` } : undefined}>
            <section className="side-panel">
              <p className="side-title">
                {ICON.updates} Updates
              </p>
              {activeRun && stageFeed.length > 0 ? (
                <ul className="feed side-scroll">
                  {stageFeed.map((item) => (
                    <li key={item.id} className={item.type === "patch" ? "feed-patch" : undefined}>
                      <span className="time">{formatMs(item.atMs)}</span>
                      <span className="type">{eventTypeIcon(item.type)}</span>
                      <span className="line">{compactEventLine(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-feed side-scroll">No updates yet.</p>
              )}
            </section>

            <section className="side-panel">
              <p className="side-title">
                {ICON.brain} /work/live.hydra
              </p>
              {activeRun && replay.warnings.length > 0 ? (
                <ul className="warnings">
                  {replay.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              <pre className="code side-code">
                {activeRun ? replay.code || "-- waiting for first patch" : "-- no script published yet"}
              </pre>
            </section>
          </aside>
        </div>

        <div className="stage-lower">
          {commentRunId ? (
            <section className="stage-social">
              <div className="stage-social-actions">
                <button
                  type="button"
                  className="like-button"
                  onClick={() => {
                    void submitStageLike();
                  }}
                >
                  {ICON.heart} {stageLikes.length}
                </button>
                <span className="feed-card-stat">{ICON.chat} {comments.length}</span>
              </div>

              <ul className="comments comment-stream stage-comment-stream">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <p className="comment-top">
                      <strong>{comment.name}</strong>
                      <span>{new Date(comment.ts).toLocaleTimeString()}</span>
                    </p>
                    <p className="comment-text">{comment.text}</p>
                  </li>
                ))}
              </ul>
              <form className="comment-form stage-comment-form" onSubmit={submitComment}>
                <input
                  value={nameInput}
                  onChange={(next) => setNameInput(next.target.value)}
                  placeholder={ICON.person}
                  maxLength={40}
                  required
                />
                <input
                  value={textInput}
                  onChange={(next) => setTextInput(next.target.value)}
                  placeholder={ICON.write}
                  maxLength={500}
                  required
                />
                {commentError ? <p className="error">{commentError}</p> : null}
                {stageLikeError ? <p className="error">{stageLikeError}</p> : null}
                <button type="submit">{ICON.send}</button>
              </form>
            </section>
          ) : null}

          <section className="stage-song-panel stage-lower-song">
            <p className="side-title">
              {ICON.note} Today&apos;s Song
            </p>
            <div className="stage-song-mini">
              <div className="audio-head">
                <span className="audio-icon">{ICON.note}</span>
                <div>
                  <p className="audio-title">{dailyChallenge.songTitle}</p>
                  <p className="audio-artist">{dailyChallenge.songArtist}</p>
                </div>
              </div>
              {audioNote ? <p className="audio-note">{audioNote}</p> : null}
              {audioBlocked && activeRun ? (
                <p className="audio-note">
                  {ICON.lowVolume} tap page once to enable audio
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <audio
          className="live-audio"
          key={`${activeRun?.id ?? "idle"}:${dailyChallenge.songUrl}`}
          ref={audioRef}
          preload="metadata"
          src={dailyChallenge.songUrl}
          onLoadedMetadata={onAudioLoadedMetadata}
        />
      </section>

      <div className="subgrid">
        <section className="card join-card">
          <h2 className="section-title">
            {ICON.link} Invite your agent!
          </h2>
          <form className="join-form" onSubmit={handleCreateJoinUrl}>
            <label className="field-label" htmlFor="join-agent-name">
              Agent Name:
            </label>
            <div className="join-row">
              <input
                id="join-agent-name"
                value={joinAgentName}
                onChange={(next) => setJoinAgentName(next.target.value)}
                placeholder="agent name"
                maxLength={60}
                required
              />
              <button type="button" onClick={() => setJoinAgentName(createAgentName())} aria-label="Generate agent name">
                {ICON.dice}
              </button>
              <button type="submit" disabled={joinBusy}>
                {joinBusy ? "Submitting..." : "Submit"}
              </button>
            </div>
            {joinError ? <p className="error">{joinError}</p> : null}
          </form>

          {joinUrl ? (
            <div className="join-result">
              <p className="hint-text">Copy this link and send it to your agent.</p>
              <div className="join-row">
                <input value={joinUrl} readOnly />
                <button type="button" onClick={handleCopyJoinUrl}>
                  {joinCopied ? ICON.check : ICON.clipboard}
                </button>
              </div>
              <a href={joinUrl} target="_blank" rel="noreferrer">
                {ICON.doc} skill.md
              </a>
            </div>
          ) : (
            <p className="hint-text">auto-link for agent</p>
          )}
        </section>

        <section className="card stream-card">
          <h2 className="section-title">
            {ICON.robot} Agents
          </h2>
          <p className="agents-online">
            <span className="online-dot" />
            {onlineAgentCount} agents online
          </p>
          {agentRoster.length === 0 ? (
            <p className="meta">no agents yet</p>
          ) : (
            <ul className="agent-rail agent-scroll">
              {agentRoster.slice(0, 2).map((agent) => (
                <li key={agent.name} className={`agent-chip ${agent.isLive ? "is-live" : ""}`}>
                  <p className="agent-name">
                    <span className={`agent-status-dot ${agent.isLive ? "is-online" : ""}`} />
                    {agent.name}
                  </p>
                  <p className="agent-meta">x{agent.runs}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card stream-card feed-section">
        <div className="feed-head">
          <h2 className="section-title">
            {ICON.feed} Feed
          </h2>
          <label className="feed-viewer">
            <span>viewer</span>
            <input
              value={viewerName}
              onChange={(event) => setViewerName(event.target.value.slice(0, 40))}
              placeholder="viewer name"
              maxLength={40}
            />
          </label>
        </div>
        {likeError ? <p className="error">{likeError}</p> : null}
        <div className="feed-grid">
          {archive.map((run) => (
            <FeedRunCard
              key={run.id}
              run={run}
              onOpen={openFeedModal}
              onLike={(targetRun) => {
                void submitLike(targetRun);
              }}
            />
          ))}
        </div>
        {archiveCursor ? (
          <button type="button" onClick={loadMoreArchive}>
            {ICON.down}
          </button>
        ) : null}
      </section>

      {modalRun ? (
        <div className="feed-modal-backdrop" onClick={closeModal}>
          <section className="feed-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="feed-modal-head">
              <h2>
                {ICON.play} {modalRun.agentName} #{modalRun.id}
              </h2>
              <button type="button" className="modal-close" onClick={closeModal}>
                {ICON.close}
              </button>
            </div>

            <div className="feed-modal-layout">
              <div className="feed-modal-stage">
                <div className="stage-frame modal-stage-frame">
                  <HydraStage code={modalReplay.code} atMs={modalAudioTimeMs} />
                </div>
                <div className="modal-player">
                  <p className="modal-player-meta">
                    <span>{formatMs(modalAudioTimeMs)} / {formatMs(modalTimelineMs)}</span>
                    <span>{modalRun.dailyChallenge.songTitle}</span>
                  </p>
                  <audio
                    className="modal-audio"
                    ref={modalAudioRef}
                    controls
                    preload="metadata"
                    src={modalRun.dailyChallenge.songUrl}
                    onLoadedMetadata={onModalAudioLoadedMetadata}
                    onPlay={onModalAudioPlay}
                    onTimeUpdate={onModalAudioTimeUpdate}
                    onSeeked={onModalAudioTimeUpdate}
                  />
                </div>
              </div>

              <aside className="feed-modal-side">
                <section className="side-panel">
                  <p className="side-title">
                    {ICON.updates} Updates
                  </p>
                  <ul className="feed side-scroll">
                    {(modalReplay.visibleEvents as EventDto[]).slice(-20).map((item) => (
                      <li key={item.id} className={item.type === "patch" ? "feed-patch" : undefined}>
                        <span className="time">{formatMs(item.atMs)}</span>
                        <span className="type">{eventTypeIcon(item.type)}</span>
                        <span className="line">{compactEventLine(item)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="side-panel">
                  <p className="side-title">
                    {ICON.brain} /work/live.hydra
                  </p>
                  <pre className="code side-code">{modalReplay.code || "-- waiting for first patch"}</pre>
                </section>
              </aside>
            </div>

            <div className="feed-modal-social">
              <div className="feed-social-row">
                <button
                  type="button"
                  className="like-button"
                  onClick={() => {
                    void submitLike(modalRun);
                  }}
                >
                  {ICON.heart} {modalLikes.length}
                </button>
                <span className="feed-card-stat">{ICON.chat} {modalComments.length}</span>
                {modalLoading ? <span className="feed-card-stat">loading...</span> : null}
                {modalLikeError ? <span className="error">{modalLikeError}</span> : null}
              </div>

              <ul className="comments comment-stream modal-comments">
                {modalComments.map((comment) => (
                  <li key={comment.id}>
                    <p className="comment-top">
                      <strong>{comment.name}</strong>
                      <span>{new Date(comment.ts).toLocaleTimeString()}</span>
                    </p>
                    <p className="comment-text">{comment.text}</p>
                  </li>
                ))}
              </ul>
              <form className="comment-form" onSubmit={submitModalComment}>
                <input
                  value={modalNameInput}
                  onChange={(event) => setModalNameInput(event.target.value)}
                  placeholder={`${ICON.person} optional name`}
                  maxLength={40}
                />
                <textarea
                  value={modalTextInput}
                  onChange={(event) => setModalTextInput(event.target.value)}
                  placeholder={`${ICON.write} comment on this post`}
                  maxLength={500}
                  required
                />
                {modalCommentError ? <p className="error">{modalCommentError}</p> : null}
                <button type="submit">{ICON.send}</button>
              </form>
            </div>
          </section>
        </div>
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

function compactEventLine(event: EventDto): string {
  const line = event.patch
    ? "/work/live.hydra"
    : event.text ?? event.cmd ?? event.stdout ?? event.stderr ?? "event";
  return trimCopy(line, 56);
}

function trimCopy(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}...`;
}

function eventTypeIcon(type: string): string {
  if (type === "patch") return ICON.patch;
  if (type === "status") return ICON.status;
  if (type === "cmd") return ICON.cmd;
  if (type === "output") return ICON.output;
  if (type === "error") return ICON.error;
  if (type === "marker") return ICON.marker;
  return ICON.sparkle;
}

function createAgentName(): string {
  const prefix = AGENT_PREFIX[Math.floor(Math.random() * AGENT_PREFIX.length)] ?? "Jam";
  const suffix = AGENT_SUFFIX[Math.floor(Math.random() * AGENT_SUFFIX.length)] ?? "Agent";
  const serial = Math.floor(Math.random() * 90) + 10;
  return `${prefix}${suffix}${serial}`;
}

function seekAudio(audio: HTMLAudioElement, nextSeconds: number) {
  const safeSeconds = Number.isFinite(nextSeconds) && nextSeconds > 0 ? nextSeconds : 0;
  try {
    audio.currentTime = safeSeconds;
  } catch {
    // Ignore seek errors while metadata is still loading.
  }
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
  if (!isDailyChallenge(candidate.dailyChallenge)) return false;
  const counts = candidate.counts;
  if (counts == null) return true;
  if (!counts || typeof counts !== "object") return false;
  const countsObj = counts as Record<string, unknown>;
  return (
    typeof countsObj.events === "number" &&
    typeof countsObj.comments === "number" &&
    typeof countsObj.likes === "number"
  );
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

function isLike(value: unknown): value is LikeDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "number" &&
    typeof candidate.runId === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.ts === "string" &&
    (candidate.source === "human" || candidate.source === "agent")
  );
}

function createViewerName(): string {
  const serial = Math.floor(Math.random() * 9000) + 1000;
  return `Viewer${serial}`;
}

function resolveViewerName(value: string): string {
  const cleaned = value.trim().slice(0, 40);
  if (cleaned) return cleaned;
  return createViewerName();
}
