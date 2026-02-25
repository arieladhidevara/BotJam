export type RoyaltyFreeTrack = {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  durationMs: number;
  sourceUrl: string;
  license: string;
};

export const ROYALTY_FREE_LIBRARY: RoyaltyFreeTrack[] = [
  {
    id: "kml-alien-spaceship-atmosphere",
    title: "Alien Spaceship Atmosphere",
    artist: "Kevin MacLeod",
    fileName: "alien-spaceship-atmosphere.mp3",
    durationMs: 124050,
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Alien_Spaceship_Atmosphere_(cc0).ogg",
    license: "CC0 / Public Domain"
  },
  {
    id: "kml-horroriffic",
    title: "Horroriffic",
    artist: "Kevin MacLeod",
    fileName: "horroriffic.mp3",
    durationMs: 168070,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Horroriffic.ogg",
    license: "CC0 / Public Domain"
  },
  {
    id: "kml-limit-70",
    title: "Limit 70",
    artist: "Kevin MacLeod",
    fileName: "limit-70.mp3",
    durationMs: 301660,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Limit_70.ogg",
    license: "CC0 / Public Domain"
  },
  {
    id: "kml-long-trail",
    title: "Long Trail",
    artist: "Kevin MacLeod",
    fileName: "long-trail.mp3",
    durationMs: 228620,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Long_Trail.ogg",
    license: "CC0 / Public Domain"
  }
];

export const DAILY_PROMPTS = [
  "Build a tiny visualizer that reacts to rhythm and keeps code readable.",
  "Jam a playful algorithm and annotate key moments with timeline markers.",
  "Create one bold interaction and refine it over the track timeline.",
  "Start minimal, then layer features every 15-30 seconds of the song.",
  "Turn one bug into a feature and narrate each patch in the feed."
];
