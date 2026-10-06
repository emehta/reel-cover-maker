/**
 * The page's side of the liquid layers: which are drawn, which are waited
 * on, and one worker drawing them in turn.
 *
 * Every canvas asks for the layers its scene holds, for its own size and
 * scale. A drawn layer is kept (a few dozen of them), so turning back to a
 * style or a colour draws nothing again. The worker draws one at a time:
 * the preview first, then the thumbnails, and a newer request for the same
 * canvas replaces an older one still waiting, so fast typing never queues
 * work for titles already gone.
 */

import { renderLiquid, type LiquidImage, type LiquidPaint, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import type { LiquidOp } from "@/components/reel-cover-maker/scene";

export interface LiquidLayer {
  image: HTMLCanvasElement;
  x: number;
  y: number;
}

/** How many drawn layers are kept. */
const KEEP = 48;

const drawn = new Map<string, LiquidLayer | null>();
const waiting = new Map<string, ((layer: LiquidLayer | null) => void)[]>();
/** The latest request from each canvas, not yet sent. */
const queued = new Map<string, { key: string; paint: LiquidPaint; target: LiquidTarget }>();
let busy = false;
let nextId = 1;
let version = 0;
const listeners = new Set<() => void>();

/** For useSyncExternalStore: told whenever a layer has been drawn. */
export function subscribeLayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A count that moves each time a layer is drawn. */
export function layersVersion(): number {
  return version;
}
let worker: Worker | null | undefined;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./liquid.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

/** What a layer is, drawn for one canvas. */
export function layerKey(op: LiquidOp, target: LiquidTarget): string {
  return `${op.key}|${op.finish}|${target.width}x${target.height}@${target.scale.toFixed(5)}+${target.origin.x.toFixed(2)},${target.origin.y.toFixed(2)}`;
}

/** The layer for a canvas, if it has been drawn; undefined if not yet. */
export function drawnLayer(op: LiquidOp, target: LiquidTarget): LiquidLayer | null | undefined {
  const key = layerKey(op, target);
  return drawn.has(key) ? (drawn.get(key) ?? null) : undefined;
}

function toLayer(image: LiquidImage | null): LiquidLayer | null {
  if (!image) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.w;
  canvas.height = image.h;
  canvas.getContext("2d")?.putImageData(new ImageData(image.data, image.w, image.h), 0, 0);
  return { image: canvas, x: image.x, y: image.y };
}

function keep(key: string, layer: LiquidLayer | null) {
  drawn.delete(key);
  drawn.set(key, layer);
  while (drawn.size > KEEP) drawn.delete(drawn.keys().next().value as string);
  for (const resolve of waiting.get(key) ?? []) resolve(layer);
  waiting.delete(key);
  version += 1;
  for (const listener of listeners) listener();
}

function pump() {
  if (busy || !queued.size) return;
  // The preview before the thumbnails.
  const slot = queued.has("main") ? "main" : (queued.keys().next().value as string);
  const job = queued.get(slot);
  queued.delete(slot);
  if (!job) return;
  if (drawn.has(job.key)) {
    keep(job.key, drawn.get(job.key) ?? null);
    pump();
    return;
  }
  busy = true;
  const done = (image: LiquidImage | null) => {
    keep(job.key, toLayer(image));
    busy = false;
    pump();
  };
  const w = getWorker();
  if (!w) {
    // No worker (a very old browser): draw here, a moment later.
    window.setTimeout(() => done(renderLiquid(job.paint, job.target)), 0);
    return;
  }
  const id = nextId;
  nextId += 1;
  const onMessage = (event: MessageEvent<{ id: number; image: LiquidImage | null }>) => {
    if (event.data.id !== id) return;
    w.removeEventListener("message", onMessage);
    done(event.data.image);
  };
  w.addEventListener("message", onMessage);
  w.postMessage({ id, paint: job.paint, target: job.target });
}

/**
 * Every layer of `ops` for a canvas, drawn: at once if all are kept, else
 * once the worker has drawn them. `slot` names the canvas, so a newer
 * request from it replaces an older one; a replaced request settles as
 * null, and its canvas, which has moved on, draws nothing from it.
 */
export function drawLayers(ops: LiquidOp[], target: LiquidTarget, slot: string): Promise<(LiquidLayer | null)[] | null> {
  // Anything this canvas had queued is for a picture it no longer shows.
  for (const [s, job] of queued) {
    if (s === slot || s.startsWith(`${slot}#`)) {
      queued.delete(s);
      for (const resolve of waiting.get(job.key) ?? []) resolve(null);
      waiting.delete(job.key);
    }
  }
  const promises = ops.map((op, i) => {
    const key = layerKey(op, target);
    if (drawn.has(key)) return Promise.resolve(drawn.get(key) ?? null);
    return new Promise<LiquidLayer | null | "replaced">((resolve) => {
      const list = waiting.get(key) ?? [];
      list.push((layer) => resolve(layer ?? (drawn.has(key) ? null : "replaced")));
      waiting.set(key, list);
      queued.set(i ? `${slot}#${i}` : slot, {
        key,
        target,
        paint: { chains: op.chains, colours: op.colours, colourOf: op.colourOf, tone: op.tone, finish: op.finish, pool: op.pool, seed: op.seed },
      });
    });
  });
  pump();
  return Promise.all(promises).then((layers) => (layers.some((l) => l === "replaced") ? null : (layers as (LiquidLayer | null)[])));
}
