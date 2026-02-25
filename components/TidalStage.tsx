"use client";

import { useMemo } from "react";

type TidalStageProps = {
  code: string;
  atMs: number;
};

type ParsedChannel = {
  voice: string;
  source: string;
  steps: string[];
};

type ParsedTidalCode = {
  cps: number;
  channels: ParsedChannel[];
  warnings: string[];
};

const DEFAULT_CPS = 0.6;
const MAX_STEPS_PER_CHANNEL = 24;

export default function TidalStage({ code, atMs }: TidalStageProps) {
  const parsed = useMemo(() => parseTidalCode(code), [code]);
  const cycle = (atMs / 1000) * parsed.cps;
  const cycleInBar = cycle - Math.floor(cycle);

  return (
    <div className="tidal-stage">
      <div className="tidal-stage-head">
        <span>Tidal Replay</span>
        <span>cps {parsed.cps.toFixed(2)}</span>
        <span>cycle {cycle.toFixed(2)}</span>
      </div>

      {parsed.channels.length === 0 ? (
        <p className="tidal-empty">No Tidal patch yet. Waiting for /work/live.tidal updates.</p>
      ) : (
        <div className="tidal-grid">
          {parsed.channels.map((channel) => (
            <ChannelRow key={`${channel.voice}:${channel.source}`} channel={channel} cycleInBar={cycleInBar} />
          ))}
        </div>
      )}

      {parsed.warnings.length > 0 ? (
        <ul className="tidal-warnings">
          {parsed.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChannelRow({ channel, cycleInBar }: { channel: ParsedChannel; cycleInBar: number }) {
  const activeIndex =
    channel.steps.length > 0 ? Math.min(channel.steps.length - 1, Math.floor(cycleInBar * channel.steps.length)) : -1;

  return (
    <div className="tidal-row">
      <div className="tidal-voice">{channel.voice}</div>
      <div className="tidal-steps">
        {channel.steps.map((step, index) => (
          <span key={`${channel.voice}:${index}:${step}`} className={`tidal-step ${index === activeIndex ? "is-active" : ""}`}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}

function parseTidalCode(code: string): ParsedTidalCode {
  const lines = normalizeCode(code).split("\n");
  const channels: ParsedChannel[] = [];
  const warnings: string[] = [];
  let cps = DEFAULT_CPS;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("--")) continue;

    const withoutComment = stripInlineComment(line);

    const cpsMatch = withoutComment.match(/^(?:setcps|cps)\s*\$?\s*([0-9]*\.?[0-9]+)/i);
    if (cpsMatch) {
      const next = Number(cpsMatch[1]);
      if (Number.isFinite(next) && next > 0) {
        cps = next;
      }
      continue;
    }

    const voiceMatch = withoutComment.match(/^(d\d+)\s*(?:\$|=|\s)/i);
    if (!voiceMatch) continue;

    const voice = voiceMatch[1].toLowerCase();
    const steps = extractSteps(withoutComment);
    if (steps.length === 0) {
      warnings.push(`Could not parse steps for ${voice}`);
      continue;
    }

    channels.push({
      voice,
      source: withoutComment,
      steps: steps.slice(0, MAX_STEPS_PER_CHANNEL)
    });
  }

  return { cps, channels, warnings };
}

function extractSteps(line: string): string[] {
  const quoted = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]?.trim() ?? "");
  const candidate = quoted.find((value) => value.length > 0) ?? line;
  return tokenizePattern(candidate);
}

function tokenizePattern(value: string): string[] {
  return value
    .replace(/[<>\[\](),]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token !== "$" && token !== "#" && token !== "sound");
}

function stripInlineComment(line: string): string {
  const index = line.indexOf("--");
  if (index < 0) return line.trim();
  return line.slice(0, index).trim();
}

function normalizeCode(code: string): string {
  return code.replace(/\r\n/g, "\n");
}
