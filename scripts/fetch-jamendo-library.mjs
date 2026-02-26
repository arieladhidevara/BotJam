#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TARGET_COUNT = 20;
const DEFAULT_TAGS = "techno,electronic,house,dance,club,edm,electropop";
const DEFAULT_MIN_DURATION_SEC = 150;
const DEFAULT_MAX_DURATION_SEC = 480;

const projectRoot = process.cwd();
const libraryDir = path.join(projectRoot, "public", "songs", "library");
const catalogPath = path.join(libraryDir, "catalog.json");
const attributionPath = path.join(libraryDir, "ATTRIBUTION.md");

const envFromFile = await readEnvFile(path.join(projectRoot, ".env"));
const env = {
  ...envFromFile,
  ...Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string"))
};

const clientId = readEnvValue(env, "JAMENDO_CLIENT_ID", "");
if (!clientId) {
  console.error("JAMENDO_CLIENT_ID is required (.env or environment).");
  process.exit(1);
}

const rawTarget = Number(process.argv[2] ?? DEFAULT_TARGET_COUNT);
const targetCount = Number.isFinite(rawTarget) && rawTarget > 0 ? Math.floor(rawTarget) : DEFAULT_TARGET_COUNT;
const tags = readEnvValue(env, "BOTJAM_JAMENDO_TAGS", DEFAULT_TAGS);
const preferredGenres = parseCsvList(readEnvValue(env, "BOTJAM_PREFERRED_GENRES", tags));
const minDurationSec = parsePositiveInt(readEnvValue(env, "BOTJAM_JAMENDO_MIN_DURATION_SEC", `${DEFAULT_MIN_DURATION_SEC}`), DEFAULT_MIN_DURATION_SEC);
const maxDurationSec = parsePositiveInt(readEnvValue(env, "BOTJAM_JAMENDO_MAX_DURATION_SEC", `${DEFAULT_MAX_DURATION_SEC}`), DEFAULT_MAX_DURATION_SEC);

await mkdir(libraryDir, { recursive: true });

const tracks = await fetchJamendoPool({
  clientId,
  tags,
  preferredGenres,
  minDurationSec,
  maxDurationSec,
  targetCount
});

if (tracks.length === 0) {
  console.error("No Jamendo tracks found with current filters.");
  process.exit(1);
}

const selected = tracks.slice(0, targetCount);
console.log(`Selected ${selected.length} tracks from Jamendo.`);

const catalogRows = [];
for (const track of selected) {
  const fileName = buildTrackFileName(track);
  const destination = path.join(libraryDir, fileName);
  await downloadTrack(track.downloadUrl, destination);

  catalogRows.push({
    id: `jamendo-${track.id}`,
    title: track.title,
    artist: track.artist,
    fileName,
    durationMs: track.durationMs,
    sourceUrl: track.sourceUrl,
    license: track.license
  });
}

await writeFile(catalogPath, `${JSON.stringify(catalogRows, null, 2)}\n`, "utf8");
await writeFile(attributionPath, renderAttribution(catalogRows), "utf8");

console.log(`Wrote ${catalogRows.length} tracks: ${catalogPath}`);
console.log(`Updated attribution: ${attributionPath}`);

async function fetchJamendoPool({
  clientId,
  tags,
  preferredGenres,
  minDurationSec,
  maxDurationSec,
  targetCount
}) {
  const requestedTags = parseCsvList(tags);
  const candidates = unique([
    tags,
    ...requestedTags,
    ...preferredGenres,
    "techno",
    "house",
    "electronic"
  ]).filter((value) => value.length > 0);

  const map = new Map();

  for (const candidate of candidates) {
    const params = new URLSearchParams({
      client_id: clientId,
      format: "json",
      limit: "200",
      include: "licenses+musicinfo",
      audioformat: "mp32",
      order: "popularity_total",
      fuzzytags: candidate
    });

    const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) continue;

    const payload = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.results)) continue;

    for (const row of payload.results) {
      const parsed = parseJamendoTrack(row, preferredGenres, minDurationSec, maxDurationSec);
      if (!parsed) continue;

      const current = map.get(parsed.id);
      if (!current || parsed.genreScore > current.genreScore) {
        map.set(parsed.id, parsed);
      }
    }

    if (map.size >= targetCount * 2) {
      break;
    }
  }

  return [...map.values()].sort((a, b) => b.genreScore - a.genreScore || String(a.id).localeCompare(String(b.id)));
}

function parseJamendoTrack(row, preferredGenres, minDurationSec, maxDurationSec) {
  if (!row || typeof row !== "object") return null;

  const audiodownloadAllowed = row.audiodownload_allowed;
  if (typeof audiodownloadAllowed === "boolean" && !audiodownloadAllowed) return null;

  const downloadUrl =
    (typeof row.audiodownload === "string" && row.audiodownload) ||
    (typeof row.audio === "string" && row.audio) ||
    "";
  if (!downloadUrl || !downloadUrl.startsWith("http")) return null;

  const id = typeof row.id === "number" || typeof row.id === "string" ? String(row.id) : "";
  if (!id) return null;

  const durationSecRaw = row.duration;
  const durationSec =
    typeof durationSecRaw === "number"
      ? durationSecRaw
      : typeof durationSecRaw === "string"
        ? Number(durationSecRaw)
        : NaN;
  if (Number.isFinite(durationSec) && (durationSec < minDurationSec || durationSec > maxDurationSec)) return null;

  const title = typeof row.name === "string" && row.name.trim() ? row.name.trim() : `Track ${id}`;
  const artist = typeof row.artist_name === "string" && row.artist_name.trim() ? row.artist_name.trim() : "Unknown Artist";

  const tags = extractTags(row);
  const genreScore = calculateGenreScore(tags, preferredGenres);

  return {
    id,
    title,
    artist,
    durationMs: Number.isFinite(durationSec) ? Math.max(0, Math.round(durationSec * 1000)) : 180000,
    sourceUrl: typeof row.shareurl === "string" && row.shareurl ? row.shareurl : downloadUrl,
    license: typeof row.license_ccurl === "string" && row.license_ccurl ? row.license_ccurl : "Jamendo License",
    downloadUrl,
    genreScore
  };
}

function extractTags(row) {
  const musicinfo = row.musicinfo;
  if (!musicinfo || typeof musicinfo !== "object") return [];
  const tags = musicinfo.tags;
  if (!tags || typeof tags !== "object") return [];

  const genres = Array.isArray(tags.genres) ? tags.genres : [];
  const vartags = Array.isArray(tags.vartags) ? tags.vartags : [];
  return [...genres, ...vartags]
    .filter((item) => typeof item === "string")
    .map((item) => normalizeTag(item));
}

function calculateGenreScore(tags, preferredGenres) {
  if (tags.length === 0 || preferredGenres.length === 0) return 0;
  const tagSet = new Set(tags.map((item) => normalizeTag(item)));
  let score = 0;
  for (const genre of preferredGenres) {
    if (tagSet.has(normalizeTag(genre))) score += 1;
  }
  return score;
}

function buildTrackFileName(track) {
  const slug = slugify(`${track.artist}-${track.title}`).slice(0, 56);
  return `jamendo-${track.id}-${slug || "track"}.mp3`;
}

async function downloadTrack(url, destination) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 100_000 || buffer.byteLength > 40_000_000) {
    throw new Error(`Downloaded file size out of range for ${url}`);
  }

  await writeFile(destination, buffer);
}

function renderAttribution(catalogRows) {
  const lines = [];
  lines.push("BotJam bundled royalty-free tracks:");
  lines.push("");
  for (let i = 0; i < catalogRows.length; i += 1) {
    const track = catalogRows[i];
    lines.push(`${i + 1}) ${track.title} - ${track.artist}`);
    lines.push(`- License: ${track.license}`);
    lines.push(`- Source: ${track.sourceUrl}`);
    lines.push("");
  }
  lines.push("Remote API mode (optional):");
  lines.push("- Provider: Jamendo API (requires JAMENDO_CLIENT_ID)");
  lines.push("- API docs: https://developer.jamendo.com/v3.0");
  lines.push("- Track license details are returned by the API and cached per day.");
  lines.push("");
  return lines.join("\n");
}

async function readEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const out = {};
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key) continue;
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function readEnvValue(envMap, key, fallback) {
  const value = envMap[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseCsvList(value) {
  return value
    .split(",")
    .map((item) => normalizeTag(item))
    .filter((item) => item.length > 0);
}

function normalizeTag(value) {
  return String(value).trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.map((item) => String(item).trim()).filter((item) => item.length > 0))];
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}
