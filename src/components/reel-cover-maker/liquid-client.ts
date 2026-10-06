/**
 * The page's side of the liquid layers: which are drawn, which are waited
 * on, and one worker drawing them in turn.
 *
 * Every canvas asks for the layers its scene holds, for its own size and
 * scale. Drawn layers are kept, so turning back to a style or a colour draws
 * nothing again, up to a budget in bytes (a phone's browser caps the memory
 * all canvases may hold), and never one a canvas on screen still needs. The
 * worker draws one at a time, the preview first; a newer request from a
 * canvas replaces its older one still waiting, so fast typing never queues
 * work for titles already gone.
 *
 * A worker can fail: its script may not load, or it may never answer. Then
 * it is set aside and the page draws the layers itself, a little slower but
 * never stuck. A layer that cannot be drawn at all is recorded as failed,
 * never as empty, so a cover is never offered without its letters.
 */

import { renderLiquid, type LiquidImage, type LiquidPaint, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import type { LiquidOp } from "@/components/reel-cover-maker/scene";

export interface LiquidLayer {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  /** Bytes the layer's canvas holds. */
  bytes: number;
}

/** The most the kept layers may hold: well inside a phone's allowance for every canvas on a page. */
const BUDGET = 64 * 1024 * 1024;

/** How long the worker may take over one layer before it is taken to have died. */
const PATIENCE_MS = 10_000;

interface Job {
  key: string;
  paint: LiquidPaint;
  target: LiquidTarget;
}

const drawn = new Map<string, LiquidLayer | null>();
const failed = new Set<string>();
/** The layers each canvas showing now needs: never let go. */
const wanted = new Map<string, Set<string>>();
/** The latest request from each canvas, not yet sent. */
const queued = new Map<string, Job>();
const listeners = new Set<() => void>();
let held = 0;
let busy = false;
let nextId = 1;
let version = 0;
/** The worker; null once it has failed or could not be made, when the page draws instead. */
let worker: Worker | null | undefined;

/** For useSyncExternalStore: told whenever a layer has been drawn, or has failed. */
export function subscribeLayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A count that moves each time a layer is drawn or fails. */
export function layersVersion(): number {
  return version;
}

function changed() {
  version += 1;
  for (const listener of listeners) listener();
}

/** What a layer is, drawn for one canvas. */
export function layerKey(op: LiquidOp, target: LiquidTarget): string {
  return `${op.key}|${target.width}x${target.height}@${target.scale.toFixed(5)}+${target.origin.x.toFixed(2)},${target.origin.y.toFixed(2)}`;
}

/** The layer for a canvas, if it has been drawn; undefined if not yet (or if it failed). */
export function drawnLayer(op: LiquidOp, target: LiquidTarget): LiquidLayer | null | undefined {
  const key = layerKey(op, target);
  return drawn.has(key) ? (drawn.get(key) ?? null) : undefined;
}

/** Whether a layer for a canvas could not be drawn at all. */
export function layerFailed(op: LiquidOp, target: LiquidTarget): boolean {
  return failed.has(layerKey(op, target));
}

function release(layer: LiquidLayer | null | undefined) {
  if (!layer) return;
  held -= layer.bytes;
  // A canvas of no size holds nothing; the browser can reclaim it at once.
  layer.image.width = 0;
  layer.image.height = 0;
}

/** Layers let go, oldest first, until `bytes` more fit the budget; those a canvas needs are kept. */
function makeRoom(bytes: number, all = false) {
  const needed = new Set([...wanted.values()].flatMap((keys) => [...keys]));
  for (const [key, layer] of drawn) {
    if (!all && held + bytes <= BUDGET) break;
    if (needed.has(key)) continue;
    release(layer);
    drawn.delete(key);
  }
}

function toCanvas(image: LiquidImage): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.w;
  canvas.height = image.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(image.data, image.w, image.h), 0, 0);
  return canvas;
}

/** Keep a drawn layer, or record that it could not be drawn, and tell the canvases. */
function settle(key: string, image: LiquidImage | null | "failed") {
  if (image === "failed") {
    failed.add(key);
  } else if (!image || image.w <= 0 || image.h <= 0) {
    // Nothing to draw (a title of spaces): a layer of nothing is a fact, not a failure.
    drawn.set(key, null);
  } else {
    const bytes = image.w * image.h * 4;
    makeRoom(bytes);
    let canvas = toCanvas(image);
    if (!canvas) {
      // Out of canvas memory, as a phone can be: let go of every layer not on screen, and try once more.
      makeRoom(bytes, true);
      canvas = toCanvas(image);
    }
    if (canvas) {
      drawn.set(key, { image: canvas, x: image.x, y: image.y, bytes });
      held += bytes;
    } else {
      failed.add(key);
    }
  }
  changed();
}

function drawHere(job: Job) {
  try {
    settle(job.key, renderLiquid(job.paint, job.target));
  } catch {
    settle(job.key, "failed");
  }
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./liquid.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  return worker;
}

function pump() {
  if (busy || !queued.size) return;
  // The preview's layers before the thumbnails'.
  const slot = [...queued.keys()].find((s) => s === "main" || s.startsWith("main#")) ?? (queued.keys().next().value as string);
  const job = queued.get(slot) as Job;
  queued.delete(slot);
  if (drawn.has(job.key) || failed.has(job.key)) {
    pump();
    return;
  }
  busy = true;
  const finish = () => {
    busy = false;
    pump();
  };
  const w = getWorker();
  if (!w) {
    // No worker: drawn here, a moment later, so a typed letter shows first.
    window.setTimeout(() => {
      try {
        drawHere(job);
      } finally {
        finish();
      }
    }, 0);
    return;
  }
  const id = nextId;
  nextId += 1;
  let over = false;
  const end = (image: LiquidImage | null | undefined, dead: boolean) => {
    if (over) return;
    over = true;
    window.clearTimeout(watchdog);
    w.removeEventListener("message", onMessage);
    w.removeEventListener("error", onError);
    w.removeEventListener("messageerror", onError);
    try {
      if (dead) {
        // Set the worker aside for good; the page draws from now on, this layer first.
        if (worker === w) worker = null;
        w.terminate();
        drawHere(job);
      } else if (image === undefined) {
        // The worker could not draw it: neither, most likely, can the page, but it is tried.
        drawHere(job);
      } else {
        settle(job.key, image);
      }
    } finally {
      finish();
    }
  };
  const onMessage = (event: MessageEvent<{ id: number; image: LiquidImage | null; error?: string }>) => {
    if (event.data?.id !== id) return;
    end(event.data.error ? undefined : event.data.image, false);
  };
  const onError = () => end(undefined, true);
  const watchdog = window.setTimeout(() => end(undefined, true), PATIENCE_MS);
  w.addEventListener("message", onMessage);
  w.addEventListener("error", onError);
  w.addEventListener("messageerror", onError);
  w.postMessage({ id, paint: job.paint, target: job.target });
}

/**
 * Ask for every layer of `ops`, drawn for a canvas. `slot` names the
 * canvas: what it asked for before and has not yet been sent is dropped,
 * and what it asks for now is kept while it shows it. The canvas hears that
 * a layer is ready through `subscribeLayers`.
 */
export function drawLayers(ops: LiquidOp[], target: LiquidTarget, slot: string): void {
  for (const s of [...queued.keys()]) if (s === slot || s.startsWith(`${slot}#`)) queued.delete(s);
  const keys = ops.map((op) => layerKey(op, target));
  wanted.set(slot, new Set(keys));
  ops.forEach((op, i) => {
    const key = keys[i];
    if (drawn.has(key) || failed.has(key)) return;
    queued.set(i ? `${slot}#${i}` : slot, {
      key,
      target,
      paint: { chains: op.chains, colours: op.colours, colourOf: op.colourOf, tone: op.tone, finish: op.finish, pool: op.pool, seed: op.seed },
    });
  });
  pump();
}
