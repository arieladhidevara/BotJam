import { access } from "node:fs/promises";
import path from "node:path";

import { toDateStamp } from "@/lib/date";

type SongSelection = {
  songTitle: string;
  songArtist: string;
  songUrl: string;
  songDurationMs?: number;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

  return {
    songTitle: "Sample Jam",
    songArtist: "BotJam",
    songUrl: "/songs/sample.mp3"
  };
}
