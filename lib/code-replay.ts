export type ReplayEvent = {
  id: number;
  atMs: number;
  type: string;
  patch?: string | null;
  text?: string | null;
  cmd?: string | null;
  stdout?: string | null;
  stderr?: string | null;
};

type ReplayResult = {
  visibleEvents: ReplayEvent[];
  code: string;
  warnings: string[];
};

export function replayToTime(events: ReplayEvent[], audioTimeMs: number): ReplayResult {
  const visibleEvents = events
    .filter((event) => event.atMs <= audioTimeMs)
    .sort((a, b) => (a.atMs === b.atMs ? a.id - b.id : a.atMs - b.atMs));

  let code = "";
  const warnings: string[] = [];

  for (const event of visibleEvents) {
    if (event.type !== "patch" || !event.patch) continue;
    const applied = applyUnifiedPatch(code, event.patch);
    if (!applied.ok) {
      warnings.push(`Patch event ${event.id} failed: ${applied.reason}`);
      continue;
    }
    code = applied.next;
  }

  return { visibleEvents, code, warnings };
}

type PatchApplyResult =
  | { ok: true; next: string }
  | { ok: false; reason: string };

function applyUnifiedPatch(input: string, patch: string): PatchApplyResult {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const source = splitLines(input);

  let i = 0;
  let delta = 0;
  let foundHunk = false;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith("@@")) {
      i += 1;
      continue;
    }

    foundHunk = true;
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!match) {
      return { ok: false, reason: "Malformed hunk header" };
    }

    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? "1");
    const newCount = Number(match[4] ?? "1");
    let pointer = (oldStart === 0 ? 0 : oldStart - 1) + delta;
    if (pointer < 0) {
      return { ok: false, reason: `Invalid hunk start near line ${oldStart}` };
    }
    i += 1;

    while (i < lines.length && !lines[i].startsWith("@@")) {
      const hunkLine = lines[i];
      if (hunkLine.startsWith("\\ No newline at end of file")) {
        i += 1;
        continue;
      }

      const prefix = hunkLine[0];
      const payload = hunkLine.slice(1);

      if (prefix === " ") {
        if (source[pointer] !== payload) {
          return { ok: false, reason: `Context mismatch near line ${pointer + 1}` };
        }
        pointer += 1;
      } else if (prefix === "-") {
        if (source[pointer] !== payload) {
          return { ok: false, reason: `Delete mismatch near line ${pointer + 1}` };
        }
        source.splice(pointer, 1);
      } else if (prefix === "+") {
        source.splice(pointer, 0, payload);
        pointer += 1;
      } else if (hunkLine.trim().length === 0) {
        break;
      } else {
        return { ok: false, reason: `Unexpected hunk line: ${hunkLine}` };
      }

      i += 1;
    }

    delta += newCount - oldCount;
  }

  if (!foundHunk) {
    return { ok: false, reason: "No hunk found in patch" };
  }

  return { ok: true, next: source.join("\n") };
}

function splitLines(value: string): string[] {
  if (!value) return [];
  return value.replace(/\r\n/g, "\n").split("\n");
}
