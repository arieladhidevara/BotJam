import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_BASE_URL = "http://localhost:3000";
const SAMPLE_RATE = 11025;
const WINDOW_MS = 250;
const MIN_BPM = 80;
const MAX_BPM = 170;

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(args.baseUrl ?? process.env.BOTJAM_BASE_URL ?? DEFAULT_BASE_URL);
const keepLive = args.keepLive;
const analyzeOnly = args.analyzeOnly;
const agentName =
  (process.env.BOTJAM_DEMO_AGENT_NAME ?? "").trim() ||
  `HydraDemoBot${Math.floor(Math.random() * 900) + 100}`;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  console.log(`[demo] base=${baseUrl}`);
  console.log(`[demo] agent=${agentName}`);

  if (analyzeOnly) {
    const today = await apiJson("/api/today");
    const rawSongUrl = asString(today?.dailyChallenge?.songUrl);
    if (!rawSongUrl) {
      throw new Error("No songUrl in /api/today");
    }

    const resolvedSongUrl = resolveSongUrl(rawSongUrl);
    const songPath = await downloadSong(resolvedSongUrl);
    try {
      const analysis = await analyzeSong(songPath, asInt(today?.dailyChallenge?.songDurationMs));
      const plan = buildHydraPlan(analysis);
      printAnalysisSummary(resolvedSongUrl, analysis, plan);
      console.log("[demo] analyze-only complete");
    } finally {
      await fs.unlink(songPath).catch(() => {});
    }
    return;
  }

  const today = await apiJson("/api/today");
  const liveRun = today?.liveRun;
  if (liveRun && typeof liveRun.id === "number") {
    const liveAgent = typeof liveRun.agentName === "string" ? liveRun.agentName : "unknown";
    throw new Error(`Stage already occupied by ${liveAgent} (run ${liveRun.id}). Wait until stage is idle.`);
  }

  const register = await apiJson("/api/agent/register", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ agentName })
  });
  const agentToken = asString(register?.agentToken);
  if (!agentToken) {
    throw new Error("Register succeeded without agentToken.");
  }

  const started = await apiJson("/api/agent/start", {
    method: "POST",
    headers: authHeaders(agentToken),
    body: JSON.stringify({ agentName })
  });

  const runId = asInt(started?.runId);
  if (!runId) {
    throw new Error("Start succeeded without runId.");
  }

  try {
    const rawSongUrl = asString(started?.songUrl) ?? asString(today?.dailyChallenge?.songUrl);
    if (!rawSongUrl) {
      throw new Error("No songUrl returned by API.");
    }

    const resolvedSongUrl = resolveSongUrl(rawSongUrl);
    const songPath = await downloadSong(resolvedSongUrl);

    let analysis;
    try {
      analysis = await analyzeSong(songPath, asInt(started?.songDurationMs));
    } finally {
      await fs.unlink(songPath).catch(() => {});
    }

    const timelineCapMs = asInt(started?.songDurationMs) ?? analysis.durationMs;
    const plan = buildHydraPlan(analysis, timelineCapMs);
    printAnalysisSummary(resolvedSongUrl, analysis, plan);

    const events = buildDemoEvents(plan, timelineCapMs);
    for (const event of events) {
      const posted = await apiJson("/api/agent/event", {
        method: "POST",
        headers: authHeaders(agentToken),
        body: JSON.stringify({
          runId,
          ...event
        })
      });
      const eventId = asInt(posted?.event?.id) ?? 0;
      console.log(
        `[demo] sent ${String(event.type).padEnd(6)} at ${formatMs(event.atMs)} (${event.atMs}ms) id=${eventId}`
      );
    }

    if (keepLive) {
      console.log(`[demo] LIVE run created: ${runId}`);
      console.log(`[demo] open ${baseUrl} and watch the stage`);
      return;
    }

    await apiJson("/api/agent/finish", {
      method: "POST",
      headers: authHeaders(agentToken),
      body: JSON.stringify({
        runId,
        finalSummary: `Hydra analysis demo: bpm=${analysis.bpm}, cues=${plan.scenes.map((scene) => formatMs(scene.atMs)).join(", ")}`
      })
    });

    console.log(`[demo] FINISHED run created: ${runId}`);
    console.log(`[demo] replay: ${baseUrl}/run/${runId}`);
  } catch (error) {
    const reason = trimOneLine(error instanceof Error ? error.message : String(error), 220);
    await apiJson("/api/agent/fail", {
      method: "POST",
      headers: authHeaders(agentToken),
      body: JSON.stringify({
        runId,
        reason
      })
    }).catch(() => {});
    throw error;
  }
}

async function analyzeSong(songPath, hintedDurationMs) {
  const durationMs = (await probeDurationMs(songPath)) ?? hintedDurationMs ?? 60_000;
  const samples = await decodeSongToMono(songPath, SAMPLE_RATE);
  if (samples.length < SAMPLE_RATE * 3) {
    throw new Error("Audio is too short for analysis.");
  }

  const frameSize = Math.max(256, Math.floor((SAMPLE_RATE * WINDOW_MS) / 1000));
  const timeline = extractEnergyTimeline(samples, SAMPLE_RATE, frameSize);
  const bpm = estimateBpm(timeline.rise, timeline.stepMs);
  const cues = detectCueMoments(timeline, durationMs);

  return {
    bpm,
    durationMs,
    timeline,
    cues
  };
}

function buildHydraPlan(analysis, timelineCapMs) {
  const scenes = [];
  const labels = ["intro", "drop", "breakdown", "peak"];
  const notes = {
    intro: "introduce base red pulse motif and gentle tempo lock",
    drop: "raise intensity and widen blue accent around percussion",
    breakdown: "reduce density but keep core pulse identity visible",
    peak: "final amplification of the same motif with strongest accents"
  };
  const continuity = {
    intro: "lock red pulse motif as the main identity, add light blue texture",
    drop: "keep the same red pulse, add stronger blue accent and faster motion",
    breakdown: "keep motif recognizable, dial motion down without changing visual world",
    peak: "keep existing motif and stack complementary accents for final lift"
  };
  const motif = createMotifProfile(analysis.bpm, analysis.cues);

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    const cue = analysis.cues[index];
    const code = createHydraCode({
      label,
      bpm: analysis.bpm,
      energyNorm: cue.energyNorm,
      variant: index,
      motif
    });

    scenes.push({
      label,
      atMs: cue.atMs,
      energyNorm: cue.energyNorm,
      note: notes[label],
      continuity: continuity[label],
      code
    });
  }

  const spaced = enforceSceneSpacing(scenes, analysis.durationMs);
  return {
    scenes: retimeScenesForDemo(spaced, timelineCapMs)
  };
}

function buildDemoEvents(plan, timelineCapMs) {
  const events = [];

  let previousCode = "";
  for (const [index, scene] of plan.scenes.entries()) {
    const patchAtMs = index === 0 ? 0 : scene.atMs;
    const statusAtMs = patchAtMs + 900;

    events.push({
      atMs: patchAtMs,
      type: "patch",
      patch: buildUnifiedPatch(previousCode, scene.code)
    });

    events.push({
      atMs: statusAtMs,
      type: "status",
      text: `${scene.label.toUpperCase()}: ${scene.note}. Continuity: ${scene.continuity}.`
    });

    previousCode = scene.code;
  }

  return normalizeEvents(events, timelineCapMs);
}

function createMotifProfile(bpm, cues) {
  const energyAvg =
    cues.reduce((sum, cue) => sum + clamp(cue.energyNorm, 0, 1), 0) / Math.max(1, cues.length);

  return {
    beatHz: round(Math.max(1.2, bpm / 60), 3),
    carrierFreq: round(5.8 + bpm / 22, 2),
    accentFreq: round(8.8 + bpm / 18 + energyAvg * 2.2, 2),
    red: {
      r: round(0.78 + energyAvg * 0.17, 3),
      g: round(0.1 + energyAvg * 0.08, 3),
      b: round(0.12 + energyAvg * 0.08, 3)
    },
    blue: {
      r: round(0.12 + energyAvg * 0.08, 3),
      g: round(0.36 + energyAvg * 0.2, 3),
      b: 1
    }
  };
}

async function downloadSong(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download song (${response.status}) from ${url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const extension = guessExtension(url, response.headers.get("content-type"));
  const target = path.join(
    os.tmpdir(),
    `botjam-song-${Date.now()}-${Math.floor(Math.random() * 100000)}.${extension}`
  );
  await fs.writeFile(target, bytes);
  return target;
}

async function probeDurationMs(songPath) {
  const output = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    songPath
  ]);
  const durationSec = Number(output.stdout.trim());
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  return Math.floor(durationSec * 1000);
}

async function decodeSongToMono(songPath, sampleRate) {
  const output = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-i",
    songPath,
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-f",
    "f32le",
    "-acodec",
    "pcm_f32le",
    "pipe:1"
  ]);

  const bytes = output.stdoutBuffer;
  const usable = bytes.length - (bytes.length % 4);
  if (usable <= 0) return new Float32Array();

  const out = new Float32Array(usable / 4);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = bytes.readFloatLE(i * 4);
  }
  return out;
}

function extractEnergyTimeline(samples, sampleRate, frameSize) {
  const rms = [];
  const rise = [];
  const timesMs = [];
  const stepMs = (frameSize / sampleRate) * 1000;
  let lastRms = 0;

  for (let start = 0; start + frameSize <= samples.length; start += frameSize) {
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const value = samples[start + i];
      sum += value * value;
    }

    const currentRms = Math.sqrt(sum / frameSize);
    rms.push(currentRms);
    rise.push(Math.max(0, currentRms - lastRms));
    timesMs.push(Math.floor((start / sampleRate) * 1000));
    lastRms = currentRms;
  }

  const min = Math.min(...rms);
  const max = Math.max(...rms);
  const span = Math.max(1e-9, max - min);
  const normalized = rms.map((value) => (value - min) / span);

  return {
    rms,
    rise,
    normalized,
    timesMs,
    stepMs
  };
}

function estimateBpm(rise, stepMs) {
  if (rise.length < 24 || stepMs <= 0) return 120;

  const minLag = Math.max(2, Math.floor((60_000 / MAX_BPM) / stepMs));
  const maxLag = Math.min(rise.length - 1, Math.ceil((60_000 / MIN_BPM) / stepMs));

  let bestLag = minLag;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = lag; i < rise.length; i += 1) {
      const a = rise[i];
      const b = rise[i - lag];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }

    const denom = Math.sqrt(normA * normB) || 1;
    const score = dot / denom;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  let bpm = 60_000 / (bestLag * stepMs);
  while (bpm < 95) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  return Math.round(clamp(bpm, MIN_BPM, MAX_BPM));
}

function detectCueMoments(timeline, durationMs) {
  const totalFrames = timeline.timesMs.length;
  const frameFromRatio = (ratio) => clamp(Math.floor(totalFrames * ratio), 0, totalFrames - 1);

  const introFrame = pickAround(
    timeline.rise,
    frameFromRatio(0.12),
    frameFromRatio(0.1),
    "max"
  );
  const dropFrame = pickAround(
    timeline.rise,
    frameFromRatio(0.34),
    frameFromRatio(0.16),
    "max"
  );
  const breakdownFrame = pickAround(
    timeline.normalized,
    frameFromRatio(0.62),
    frameFromRatio(0.14),
    "min"
  );
  const peakFrame = pickAround(
    timeline.rise,
    frameFromRatio(0.82),
    frameFromRatio(0.12),
    "max"
  );

  const cues = [
    makeCue(introFrame, timeline),
    makeCue(dropFrame, timeline),
    makeCue(breakdownFrame, timeline),
    makeCue(peakFrame, timeline)
  ];

  return enforceCueSpacing(
    cues.map((cue) => ({ ...cue, atMs: cue.atMs })),
    durationMs
  );
}

function makeCue(frameIndex, timeline) {
  const atMs = timeline.timesMs[frameIndex] ?? 0;
  const energyNorm = timeline.normalized[frameIndex] ?? 0.5;
  return {
    atMs,
    energyNorm
  };
}

function enforceCueSpacing(cues, durationMs) {
  const minStart = 3000;
  const maxEnd = Math.max(minStart + 1000, durationMs - 900);
  const minGap = 3500;
  const out = [];
  let cursor = minStart;

  for (let i = 0; i < cues.length; i += 1) {
    const remaining = cues.length - i - 1;
    const tailSpace = remaining * minGap;
    const hardMax = Math.max(cursor, maxEnd - tailSpace);
    const proposed = clamp(Math.floor(cues[i].atMs), cursor, hardMax);
    const atMs = i === 0 ? Math.max(proposed, minStart) : proposed;
    out.push({
      atMs,
      energyNorm: clamp(cues[i].energyNorm, 0, 1)
    });
    cursor = atMs + minGap;
  }

  return out;
}

function enforceSceneSpacing(scenes, durationMs) {
  const cues = scenes.map((scene) => ({
    atMs: scene.atMs,
    energyNorm: scene.energyNorm
  }));
  const spaced = enforceCueSpacing(cues, durationMs);
  return scenes.map((scene, index) => ({
    ...scene,
    atMs: spaced[index].atMs,
    energyNorm: spaced[index].energyNorm
  }));
}

function createHydraCode({ label, bpm, energyNorm, variant, motif }) {
  const stage = sceneStyle(label);
  const speedBase = 0.72 + bpm / 240 + energyNorm * 0.18;
  const speed = round(speedBase * stage.speedMul, 3);
  const pulseAmount = clamp(round(stage.pulse + energyNorm * 0.08, 3), 0.14, 0.52);
  const accentMix = clamp(round(stage.accentMix + energyNorm * 0.06, 3), 0.1, 0.58);
  const rotateA = round(stage.rotateA + variant * 0.002 + energyNorm * 0.01, 3);
  const rotateB = round(stage.rotateB + variant * 0.003 + energyNorm * 0.012, 3);
  const modAmount = round(stage.mod + energyNorm * 0.06, 3);
  const kaleid = Math.max(3, Math.round(stage.kaleid + energyNorm * 2));
  const contrast = round(stage.contrast + energyNorm * 0.08, 3);
  const saturation = round(stage.saturation + energyNorm * 0.12, 3);
  const brightness = round(stage.brightness + energyNorm * 0.03, 3);
  const carrierFreq = round(motif.carrierFreq + variant * 0.32, 2);
  const accentFreq = round(motif.accentFreq + variant * 0.58, 2);
  const noiseFreq = round(1.6 + energyNorm * 2.4 + variant * 0.15, 2);

  return [
    "setResolution(1280, 720)",
    `speed = ${speed}`,
    `const beat = () => Math.sin(time * ${motif.beatHz} * 6.28318) * 0.5 + 0.5`,
    `const pulse = () => 0.84 + beat() * ${pulseAmount}`,
    "",
    `const redBase = osc(${carrierFreq}, 0.03, 0.82)`,
    `  .color(${motif.red.r}, ${motif.red.g}, ${motif.red.b})`,
    "  .scale(() => pulse())",
    `  .rotate(() => time * ${rotateA})`,
    "",
    `const blueAccent = osc(${accentFreq}, 0.012, 1.08)`,
    `  .color(${motif.blue.r}, ${motif.blue.g}, ${motif.blue.b})`,
    `  .rotate(() => -time * ${rotateB})`,
    `  .modulate(noise(${noiseFreq}, 0.05), ${modAmount})`,
    "",
    "redBase",
    `  .add(blueAccent, ${accentMix})`,
    `  .kaleid(${kaleid})`,
    `  .contrast(${contrast})`,
    `  .saturate(${saturation})`,
    `  .brightness(${brightness})`,
    "  .out(o0)",
    "render(o0)"
  ].join("\n");
}

function sceneStyle(label) {
  if (label === "intro") {
    return {
      speedMul: 0.9,
      pulse: 0.2,
      accentMix: 0.16,
      rotateA: 0.016,
      rotateB: 0.02,
      mod: 0.08,
      kaleid: 4,
      contrast: 1.08,
      saturation: 1.05,
      brightness: -0.03
    };
  }

  if (label === "drop") {
    return {
      speedMul: 1.02,
      pulse: 0.31,
      accentMix: 0.29,
      rotateA: 0.032,
      rotateB: 0.04,
      mod: 0.14,
      kaleid: 6,
      contrast: 1.2,
      saturation: 1.28,
      brightness: 0.02
    };
  }

  if (label === "breakdown") {
    return {
      speedMul: 0.82,
      pulse: 0.17,
      accentMix: 0.2,
      rotateA: 0.018,
      rotateB: 0.024,
      mod: 0.09,
      kaleid: 4,
      contrast: 1.02,
      saturation: 0.96,
      brightness: -0.04
    };
  }

  return {
    speedMul: 1.12,
    pulse: 0.35,
    accentMix: 0.36,
    rotateA: 0.038,
    rotateB: 0.052,
    mod: 0.17,
    kaleid: 7,
    contrast: 1.26,
    saturation: 1.36,
    brightness: 0.05
  };
}

function retimeScenesForDemo(scenes, timelineCapMs) {
  const anchors = [0.1, 0.34, 0.6, 0.82];
  const minStart = 2000;
  const hardEnd = Math.max(minStart + 9000, timelineCapMs - 1200);
  const demoEnd = Math.min(hardEnd, 45_000);
  const span = Math.max(8_000, demoEnd - minStart);
  const mapped = scenes.map((scene, index) => {
    const ratio = anchors[index] ?? (index + 1) / (scenes.length + 1);
    const atMs = Math.floor(minStart + span * ratio);
    return {
      ...scene,
      atMs
    };
  });
  return enforceSceneSpacing(mapped, timelineCapMs);
}

function buildUnifiedPatch(previousCode, nextCode) {
  const previousLines = splitLines(previousCode);
  const nextLines = splitLines(nextCode);
  const oldCount = previousLines.length;
  const newCount = nextLines.length;

  const oldStart = 1;
  const newStart = 1;

  const patch = [
    "--- a/work/live.hydra",
    "+++ b/work/live.hydra",
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...previousLines.map((line) => `-${line}`),
    ...nextLines.map((line) => `+${line}`)
  ];

  return patch.join("\n");
}

function normalizeEvents(events, durationMs) {
  const maxAtMs = Math.max(1000, durationMs - 200);
  const sorted = [...events].sort((a, b) => {
    if (a.atMs !== b.atMs) return a.atMs - b.atMs;
    if (a.type === b.type) return 0;
    return a.type === "patch" ? -1 : 1;
  });

  const out = [];
  let cursor = 0;
  for (const event of sorted) {
    const bounded = clamp(Math.floor(event.atMs), 0, maxAtMs);
    const atMs = Math.max(cursor, bounded);
    out.push({ ...event, atMs });
    cursor = atMs;
  }
  return out;
}

function printAnalysisSummary(songUrl, analysis, plan) {
  console.log(`[demo] song=${songUrl}`);
  console.log(`[demo] duration=${formatMs(analysis.durationMs)} bpm=${analysis.bpm}`);
  for (const scene of plan.scenes) {
    console.log(
      `[demo] cue ${scene.label.padEnd(9)} ${formatMs(scene.atMs)} energy=${scene.energyNorm.toFixed(2)}`
    );
  }
}

async function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => err.push(Buffer.from(chunk)));

    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      const stdoutBuffer = Buffer.concat(out);
      const stderr = Buffer.concat(err).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(`${command} exited with ${code}${stderr ? `: ${stderr}` : ""}`));
        return;
      }
      resolve({
        stdout: stdoutBuffer.toString("utf8"),
        stdoutBuffer
      });
    });
  });
}

async function apiJson(pathname, init) {
  const method = init?.method ?? "GET";
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();

  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : text.slice(0, 220) || response.statusText;
    throw new Error(`${method} ${pathname} failed (${response.status}): ${message}`);
  }

  return payload;
}

function parseArgs(values) {
  const out = {
    keepLive: false,
    analyzeOnly: false,
    baseUrl: null
  };

  for (const arg of values) {
    if (arg === "--keep-live") {
      out.keepLive = true;
      continue;
    }
    if (arg === "--analyze-only") {
      out.analyzeOnly = true;
      continue;
    }
    if (arg.startsWith("--base=")) {
      out.baseUrl = arg.slice("--base=".length);
      continue;
    }
    if (!arg.startsWith("--") && !out.baseUrl) {
      out.baseUrl = arg;
    }
  }

  return out;
}

function resolveSongUrl(songUrl) {
  if (/^https?:\/\//i.test(songUrl)) return songUrl;
  if (!songUrl.startsWith("/")) return `${baseUrl}/${songUrl}`;
  return `${baseUrl}${songUrl}`;
}

function guessExtension(url, contentType) {
  const lowerType = String(contentType ?? "").toLowerCase();
  if (lowerType.includes("wav")) return "wav";
  if (lowerType.includes("ogg")) return "ogg";
  if (lowerType.includes("mpeg") || lowerType.includes("mp3")) return "mp3";

  const clean = url.split("?")[0];
  if (clean.endsWith(".wav")) return "wav";
  if (clean.endsWith(".ogg")) return "ogg";
  return "mp3";
}

function splitLines(value) {
  if (!value) return [];
  return value.replace(/\r\n/g, "\n").split("\n");
}

function pickAround(values, centerIndex, radius, mode) {
  const start = clamp(centerIndex - radius, 0, values.length - 1);
  const end = clamp(centerIndex + radius, 0, values.length - 1);
  let bestIndex = start;
  let bestValue = values[start] ?? 0;

  for (let i = start; i <= end; i += 1) {
    const current = values[i] ?? 0;
    if (mode === "max" ? current > bestValue : current < bestValue) {
      bestValue = current;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function energyBand(value) {
  if (value < 0.35) return "low";
  if (value < 0.68) return "mid";
  return "high";
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

function authHeaders(token) {
  return {
    ...jsonHeaders(),
    Authorization: `Bearer ${token}`
  };
}

function asString(value) {
  return typeof value === "string" ? value : null;
}

function asInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
}

function trimOneLine(value, maxLen) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function normalizeBaseUrl(value) {
  return String(value).trim().replace(/\/+$/, "");
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
