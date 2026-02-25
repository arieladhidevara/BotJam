import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { toDateStamp } from "@/lib/date";
import { DAILY_PROMPTS, ROYALTY_FREE_LIBRARY, type RoyaltyFreeTrack } from "@/lib/royalty-free-catalog";

export type SongSelection = {
  songTitle: string;
  songArtist: string;
  songUrl: string;
  songDurationMs?: number;
  sourceUrl?: string;
  license?: string;
};

type SongCacheFile = {
  songTitle: string;
  songArtist: string;
  songDurationMs?: number;
  sourceUrl?: string;
  license?: string;
  provider?: string;
};

type JamendoTrack = {
  title: string;
  artist: string;
  durationMs?: number;
  sourceUrl?: string;
  license?: string;
  downloadUrl: string;
};

declare global {
  // eslint-disable-next-line no-var
  var botjamSongResolveLocks: Map<string, Promise<SongSelection | null>> | undefined;
}

const resolveLocks = globalThis.botjamSongResolveLocks ?? new Map<string, Promise<SongSelection | null>>();
if (!globalThis.botjamSongResolveLocks) {
  globalThis.botjamSongResolveLocks = resolveLocks;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return hash >>> 0;
}

function pickDeterministic<T>(items: T[], seed: string): T {
  const index = hashString(seed) % items.length;
  return items[index];
}

export function resolvePromptForDate(date: Date): string {
  const stamp = toDateStamp(date);
  return pickDeterministic(DAILY_PROMPTS, `prompt:${stamp}`);
}

export async function resolveSongForDate(date: Date): Promise<SongSelection> {
  const stamp = toDateStamp(date);
  const songsDir = path.join(process.cwd(), "public", "songs");
  const datedMp3Path = path.join(songsDir, `${stamp}.mp3`);
  const datedWavPath = path.join(songsDir, `${stamp}.wav`);

  if (await fileExists(datedMp3Path)) {
    return {
      songTitle: `Daily Jam ${stamp}`,
      songArtist: "BotJam",
      songUrl: `/songs/${stamp}.mp3`
    };
  }

  if (await fileExists(datedWavPath)) {
    return {
      songTitle: `Daily Jam ${stamp}`,
      songArtist: "BotJam",
      songUrl: `/songs/${stamp}.wav`
    };
  }

  const apiSong = await resolveApiSongForDate(stamp, songsDir);
  if (apiSong) {
    return apiSong;
  }

  const localSong = await resolveLocalLibrarySong(stamp, songsDir);
  if (localSong) {
    return localSong;
  }

  return {
    songTitle: "Sample Jam",
    songArtist: "BotJam",
    songUrl: "/songs/sample.mp3"
  };
}

async function resolveApiSongForDate(stamp: string, songsDir: string): Promise<SongSelection | null> {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
  if (!clientId) {
    return null;
  }

  const dailyDir = path.join(songsDir, "daily");
  const songPath = path.join(dailyDir, `${stamp}.mp3`);
  const songUrl = `/songs/daily/${stamp}.mp3`;
  const cachePath = path.join(dailyDir, `${stamp}.json`);

  const existing = await readCachedSong(songPath, songUrl, cachePath);
  if (existing) return existing;

  const cachedPromise = resolveLocks.get(stamp);
  if (cachedPromise) {
    return cachedPromise;
  }

  const resolver = (async () => {
    try {
      const afterLock = await readCachedSong(songPath, songUrl, cachePath);
      if (afterLock) return afterLock;

      const tracks = await fetchJamendoTracks(clientId);
      if (tracks.length === 0) {
        return null;
      }

      const selected = pickDeterministic(tracks, `jamendo:${stamp}`);
      await mkdir(dailyDir, { recursive: true });
      await downloadToFile(selected.downloadUrl, songPath);

      const metadata: SongCacheFile = {
        songTitle: selected.title,
        songArtist: selected.artist,
        songDurationMs: selected.durationMs,
        sourceUrl: selected.sourceUrl,
        license: selected.license,
        provider: "jamendo"
      };
      await writeFile(cachePath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

      return {
        songTitle: selected.title,
        songArtist: selected.artist,
        songUrl,
        songDurationMs: selected.durationMs,
        sourceUrl: selected.sourceUrl,
        license: selected.license
      };
    } catch {
      return null;
    }
  })();

  resolveLocks.set(stamp, resolver);
  try {
    return await resolver;
  } finally {
    resolveLocks.delete(stamp);
  }
}

async function readCachedSong(songPath: string, songUrl: string, cachePath: string): Promise<SongSelection | null> {
  if (!(await fileExists(songPath))) return null;

  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) as SongCacheFile;
    if (typeof parsed.songTitle === "string" && typeof parsed.songArtist === "string") {
      return {
        songTitle: parsed.songTitle,
        songArtist: parsed.songArtist,
        songUrl,
        songDurationMs: parsed.songDurationMs,
        sourceUrl: parsed.sourceUrl,
        license: parsed.license
      };
    }
  } catch {
    // Use generic fallback metadata when sidecar is missing.
  }

  return {
    songTitle: "Daily API Track",
    songArtist: "Jamendo",
    songUrl
  };
}

async function resolveLocalLibrarySong(stamp: string, songsDir: string): Promise<SongSelection | null> {
  const available: RoyaltyFreeTrack[] = [];

  for (const track of ROYALTY_FREE_LIBRARY) {
    const filePath = path.join(songsDir, "library", track.fileName);
    if (await fileExists(filePath)) {
      available.push(track);
    }
  }

  if (available.length === 0) {
    return null;
  }

  const track = pickDeterministic(available, `local-library:${stamp}`);
  return {
    songTitle: track.title,
    songArtist: track.artist,
    songUrl: `/songs/library/${track.fileName}`,
    songDurationMs: track.durationMs,
    sourceUrl: track.sourceUrl,
    license: track.license
  };
}

async function fetchJamendoTracks(clientId: string): Promise<JamendoTrack[]> {
  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: "100",
    include: "licenses+musicinfo",
    audioformat: "mp32",
    order: "popularity_total",
    fuzzytags: process.env.BOTJAM_JAMENDO_TAGS ?? "instrumental,ambient,chill,electronic"
  });

  const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }

  const tracks: JamendoTrack[] = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const downloadUrl =
      (typeof row.audiodownload === "string" && row.audiodownload) ||
      (typeof row.audio === "string" && row.audio) ||
      "";

    if (!downloadUrl || !downloadUrl.startsWith("http")) continue;

    const title = typeof row.name === "string" && row.name ? row.name : "Untitled Jam";
    const artist = typeof row.artist_name === "string" && row.artist_name ? row.artist_name : "Unknown Artist";

    const durationRaw = row.duration;
    const durationSec =
      typeof durationRaw === "number"
        ? durationRaw
        : typeof durationRaw === "string"
          ? Number(durationRaw)
          : NaN;

    tracks.push({
      title,
      artist,
      durationMs: Number.isFinite(durationSec) ? Math.max(0, Math.round(durationSec * 1000)) : undefined,
      sourceUrl: typeof row.shareurl === "string" ? row.shareurl : downloadUrl,
      license: typeof row.license_ccurl === "string" ? row.license_ccurl : "Jamendo License",
      downloadUrl
    });
  }

  return tracks;
}

async function downloadToFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download track: ${response.status}`);
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());
  if (fileBuffer.byteLength < 100_000 || fileBuffer.byteLength > 40_000_000) {
    throw new Error("Downloaded file size is out of allowed range");
  }

  const tempPath = `${destination}.tmp`;
  await writeFile(tempPath, fileBuffer);

  try {
    await rename(tempPath, destination);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
