"use client";

import { useEffect, useRef, useState } from "react";

type HydraStageProps = {
  code: string;
  atMs: number;
};

type HydraRuntime = {
  hydra: any;
  canvas: HTMLCanvasElement;
};

declare global {
  interface Window {
    Hydra?: new (...args: any[]) => any;
    __botjamHydraLoader__?: Promise<new (...args: any[]) => any>;
  }
}

const HYDRA_SCRIPT_SOURCES = [
  "https://cdn.jsdelivr.net/npm/hydra-synth/dist/hydra-synth.js",
  "https://unpkg.com/hydra-synth/dist/hydra-synth.js"
] as const;

const EMPTY_SCRIPT = "solid(0, 0, 0, 1).out(o0); render(o0);";

export default function HydraStage({ code, atMs }: HydraStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<HydraRuntime | null>(null);
  const lastCodeRef = useRef<string>("");
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const boot = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        const Hydra = await loadHydraConstructor();
        if (isCancelled || !canvasRef.current) return;

        const hydra = new Hydra({
          canvas,
          detectAudio: false,
          autoLoop: true,
          makeGlobal: false
        });

        runtimeRef.current = { hydra, canvas };
        resizeHydra(runtimeRef.current);
        applyHydraScript(runtimeRef.current, code, atMs);
        setIsReady(true);
        setError(null);
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : "Hydra failed to load";
        setError(message);
      }
    };

    void boot();

    return () => {
      isCancelled = true;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      if (!runtime) return;

      try {
        const synth = runtime.hydra?.synth;
        if (synth && typeof synth.stop === "function") {
          synth.stop();
        }
      } catch {
        // Ignore cleanup errors.
      }
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const onResize = () => {
      resizeHydra(runtime);
    };

    onResize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(onResize);
      observer.observe(runtime.canvas);
      window.addEventListener("resize", onResize);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", onResize);
      };
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [isReady]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    syncHydraClock(runtime, atMs);

    if (lastCodeRef.current === code) return;
    lastCodeRef.current = code;

    try {
      applyHydraScript(runtime, code, atMs);
      setError(null);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Hydra script error";
      setError(message);
    }
  }, [atMs, code]);

  return (
    <div className="hydra-stage">
      <canvas ref={canvasRef} className="hydra-canvas" />
      {!isReady ? <p className="hydra-empty">Loading Hydra...</p> : null}
      {error ? <p className="hydra-error">{error}</p> : null}
    </div>
  );
}

function applyHydraScript(runtime: HydraRuntime, source: string, atMs: number) {
  syncHydraClock(runtime, atMs);

  const sanitized = normalizeHydraCode(source);
  const script = sanitized.trim().length > 0 ? sanitized : EMPTY_SCRIPT;
  const scope = buildHydraScope(runtime, atMs);
  const execute = new Function(
    "scope",
    "atMs",
    `with (scope) {\n${script}\n}`
  ) as (scope: Record<string, unknown>, atMs: number) => void;
  execute(scope, atMs);
}

function syncHydraClock(runtime: HydraRuntime, atMs: number) {
  const nextSeconds = Math.max(0, atMs) / 1000;
  const synth = runtime.hydra?.synth ?? runtime.hydra;

  if (synth) {
    if (typeof synth.setTime === "function") {
      synth.setTime(nextSeconds);
    }

    if ("time" in synth) {
      try {
        (synth as { time: number }).time = nextSeconds;
      } catch {
        // Ignore readonly clock assignments.
      }
    }
  }
}

function resizeHydra(runtime: HydraRuntime) {
  const { canvas, hydra } = runtime;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(2, Math.floor(rect.width * dpr));
  const height = Math.max(2, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  if (typeof hydra?.setResolution === "function") {
    hydra.setResolution(width, height);
  }
}

function normalizeHydraCode(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n");
  const fencedMatch = normalized.match(/```(?:javascript|js|hydra)?\n([\s\S]*?)```/i);
  return (fencedMatch ? fencedMatch[1] : normalized).trim();
}

async function loadHydraConstructor(): Promise<new (...args: any[]) => any> {
  if (typeof window === "undefined") {
    throw new Error("Hydra requires a browser environment");
  }

  if (window.Hydra) {
    return window.Hydra;
  }

  const localHydra = await loadHydraFromModule();
  if (localHydra) {
    return localHydra;
  }

  if (!window.__botjamHydraLoader__) {
    window.__botjamHydraLoader__ = (async () => {
      for (const source of HYDRA_SCRIPT_SOURCES) {
        try {
          await injectHydraScript(source);
          if (window.Hydra) {
            return window.Hydra;
          }
        } catch {
          // Try next source.
        }
      }

      throw new Error("Unable to load hydra-synth from CDN");
    })();
  }

  return window.__botjamHydraLoader__;
}

async function loadHydraFromModule(): Promise<(new (...args: any[]) => any) | null> {
  try {
    const imported = await import("hydra-synth");
    const candidate = (imported as { default?: unknown }).default ?? imported;
    if (typeof candidate === "function") {
      window.Hydra = candidate as new (...args: any[]) => any;
      return window.Hydra;
    }
  } catch {
    // Fall back to CDN loader.
  }

  return null;
}

function injectHydraScript(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-hydra-src="${source}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.hydraSrc = source;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${source}`));

    document.head.appendChild(script);
  });
}

function buildHydraScope(runtime: HydraRuntime, atMs: number): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  const synth = runtime.hydra?.synth ?? runtime.hydra;

  bindScopeMembers(scope, runtime.hydra);
  bindScopeMembers(scope, synth);

  if (typeof runtime.hydra?.setResolution === "function") {
    scope.setResolution = runtime.hydra.setResolution.bind(runtime.hydra);
  }

  Object.defineProperty(scope, "time", {
    enumerable: true,
    configurable: true,
    get: () => {
      if (synth && typeof synth.time === "number") {
        return synth.time;
      }
      return Math.max(0, atMs) / 1000;
    },
    set: (next) => {
      if (!synth || typeof next !== "number") return;
      if ("time" in synth) {
        try {
          (synth as { time: number }).time = next;
        } catch {
          // Ignore readonly clock assignment.
        }
      }
    }
  });

  return scope;
}

function bindScopeMembers(scope: Record<string, unknown>, source: unknown) {
  if (!source || (typeof source !== "object" && typeof source !== "function")) return;

  const target = source as Record<string, unknown>;
  const visited = new Set<string>();
  let current: object | null = source as object;

  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === "constructor" || visited.has(key)) continue;
      visited.add(key);

      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor) continue;

      if ("value" in descriptor) {
        const value = target[key];
        if (typeof value === "function") {
          scope[key] = (value as Function).bind(source);
        } else {
          scope[key] = value;
        }
        continue;
      }

      if (descriptor.get || descriptor.set) {
        Object.defineProperty(scope, key, {
          enumerable: true,
          configurable: true,
          get: () => target[key],
          set: (next) => {
            try {
              target[key] = next;
            } catch {
              // Ignore readonly assignment.
            }
          }
        });
      }
    }

    current = Object.getPrototypeOf(current);
  }
}
