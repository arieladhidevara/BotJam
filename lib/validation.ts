import { EventType } from "@prisma/client";

export const LIMITS = {
  agentName: 60,
  commentName: 40,
  commentText: 500,
  likeName: 40,
  eventText: 4000,
  eventPatch: 30000,
  eventCmd: 4000,
  eventOutput: 50000,
  finalSummary: 6000
} as const;

export function parsePositiveInt(
  value: string | null | undefined,
  fallback: number,
  max: number
): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

export function parseCursorInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function trimAndValidate(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function maybeString(value: unknown, maxLen: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  if (value.length > maxLen) return null;
  return value;
}

export function parseEventType(value: unknown): EventType | null {
  if (typeof value !== "string") return null;
  if ((Object.values(EventType) as string[]).includes(value)) {
    return value as EventType;
  }
  return null;
}

const LIKE_SOURCES = ["human", "agent"] as const;

export function parseLikeSource(value: unknown): "human" | "agent" | null {
  if (typeof value !== "string") return null;
  if ((LIKE_SOURCES as readonly string[]).includes(value)) {
    return value as "human" | "agent";
  }
  return null;
}

export function badRequest(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
