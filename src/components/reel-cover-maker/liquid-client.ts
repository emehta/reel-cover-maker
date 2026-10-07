/**
 * The page's side of the liquid layers: which are made, which are waited
 * on, and one worker making them in turn.
 *
 * Every canvas asks for the layers its scene holds, for its own size and
 * scale. A layer is made in two parts: the paste's field (where it is, how
 * deep, how high), which is slow and done in the worker, once per title and
 * canvas; and the light on it, done on the GPU each time the canvas is
 * painted, so a colour or ground being dragged never waits on the worker.
 * Fields are kept, so turning back to a style makes nothing again, up to a
 * budget in bytes, and never one a canvas on screen still needs. A newer
 * request from a canvas replaces its older one still waiting, so fast
 * typing never queues work for titles already gone.
 *
 * Two workers make them, each one at a time, in the order they are needed
 * (`LayerUse`): the preview's quick draft, the preview, the thumbnails, and
 * then, ahead of time, the preview as every other style would draw it, so
 * picking one shows it at once. Only one worker ever works ahead, so the
 * other is always free for what is on screen.
 *
 * A worker can fail: its script may not load, or it may never answer. Then
 * the workers are set aside and the page draws the layers itself, a little
 * slower but never stuck, and nothing ahead of time. A layer that cannot be
 * drawn at all is recorded as failed, never as empty, so a cover is never
 * offered without its letters.
 */

import { shadeOnGpu } from "@/components/reel-cover-maker/liquid-gl";
import { liquidField, shadeField, type LiquidField, type LiquidPaint, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import type { LiquidOp } from "@/components/reel-cover-maker/scene";

export interface LiquidLayer {
  image: CanvasImageSource;
  /** Where the layer is in `image`, and how big. */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** Where it goes on the canvas being painted, in that canvas's pixels. */
  x: number;
  y: number;
}

/** The most the kept fields may hold: eight bytes a pixel, so about four full-size covers. */
const BUDGET = 96 * 1024 * 1024;

/** Layers lit without a GPU, kept by field and colours: lighting them again is slow. */
const LIT_KEPT = 24;

/** How long a worker may take over one layer before it is taken to have died. */
const PATIENCE_MS = 10_000;

/** The most workers making layers at once. */
const WORKERS = 2;

/**
 * What a canvas wants its layers for, most pressing first: the preview's
 * quick draft, shown while the preview's own is made; the preview's own;
 * a thumbnail's; and the preview's for a style not showing yet.
 */
export type LayerUse = "draft" | "main" | "thumb" | "ahead";

const RANK: Record<LayerUse, number> = { draft: 0, main: 1, thumb: 2, ahead: 3 };

interface Job {
  key: string;
  paint: LiquidPaint;
  target: LiquidTarget;
  use: LayerUse;
}

const drawn = new Map<string, LiquidField | null>();
const lit = new Map<string, HTMLCanvasElement>();
const failed = new Set<string>();
/** The layers each canvas showing now needs: never let go. */
const wanted = new Map<string, Set<string>>();
/** The latest request from each canvas, not yet sent. */
const queued = new Map<string, Job>();
/** The layers being made now, and what for. */
const making = new Map<string, LayerUse>();
const listeners = new Set<() => void>();
let held = 0;
let nextId = 1;
let version = 0;
/** A worker, and how to call off the layer it is making, if it is making one. */
interface Lane {
  worker: Worker;
  abort: (() => void) | null;
}

/** The workers; null once one has failed or none could be made, when the page draws instead. */
let lanes: Lane[] | null = [];
/** The page drawing a layer itself, with no workers. */
let drawingHere = false;

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

/** Whether a layer's field is made for a canvas (or is known to hold nothing), so it can be lit. */
export function layerReady(op: LiquidOp, target: LiquidTarget): boolean {
  return drawn.has(layerKey(op, target));
}

function toCanvas(image: ImageData): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * The layer for a canvas, lit in the op's colours, to be drawn at once (on
 * the GPU it is one canvas shared by every layer, lit again for the next);
 * null if it holds nothing, undefined if its field is not made yet.
 */
export function liquidLayer(op: LiquidOp, target: LiquidTarget, part: "paste" | "shadow" = "paste"): LiquidLayer | null | undefined {
  const key = layerKey(op, target);
  if (!drawn.has(key)) return undefined;
  const field = drawn.get(key);
  if (!field) return null;
  const shading = { colours: op.colours, ground: op.ground, under: op.under, shadow: part === "shadow" };
  const gpu = shadeOnGpu(field, shading, op.seed);
  if (gpu) return { image: gpu.canvas, sx: gpu.sx, sy: gpu.sy, w: field.w, h: field.h, x: field.x, y: field.y };
  // No WebGL 2: lit here, and kept, since that is slow.
  const litKey = `${key}|${op.colours.join(",")}|${op.ground ?? "-"}|${op.under ?? "-"}|${part}`;
  let canvas = lit.get(litKey);
  if (!canvas) {
    const image = shadeField(field, shading);
    const made = toCanvas(new ImageData(image.data, image.w, image.h));
    if (!made) return null;
    canvas = made;
    lit.set(litKey, canvas);
    while (lit.size > LIT_KEPT) {
      const [oldest, old] = lit.entries().next().value as [string, HTMLCanvasElement];
      old.width = 0;
      old.height = 0;
      lit.delete(oldest);
    }
  } else {
    lit.delete(litKey);
    lit.set(litKey, canvas);
  }
  return { image: canvas, sx: 0, sy: 0, w: field.w, h: field.h, x: field.x, y: field.y };
}

/** Whether a layer for a canvas could not be drawn at all. */
export function layerFailed(op: LiquidOp, target: LiquidTarget): boolean {
  return failed.has(layerKey(op, target));
}

function release(field: LiquidField | null | undefined) {
  if (field) held -= field.data.byteLength;
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

/** Keep a made field, or record that it could not be made, and tell the canvases. */
function settle(key: string, field: LiquidField | null | "failed") {
  if (field === "failed") {
    failed.add(key);
  } else if (!field || field.w <= 0 || field.h <= 0) {
    // Nothing to draw (a title of spaces): a layer of nothing is a fact, not a failure.
    drawn.set(key, null);
  } else {
    makeRoom(field.data.byteLength);
    drawn.set(key, field);
    held += field.data.byteLength;
  }
  changed();
}

function drawHere(job: Job) {
  try {
    settle(job.key, liquidField(job.paint, job.target));
  } catch {
    settle(job.key, "failed");
  }
}

/** A worker free to take a layer, made if there is room for one more; null if every one is busy, or there are none. */
function freeLane(): Lane | null {
  if (!lanes) return null;
  const idle = lanes.find((lane) => !lane.abort);
  if (idle || lanes.length >= WORKERS) return idle ?? null;
  try {
    const lane: Lane = { worker: new Worker(new URL("./liquid.worker.ts", import.meta.url), { type: "module" }), abort: null };
    lanes.push(lane);
    return lane;
  } catch {
    giveUpWorkers();
    return null;
  }
}

/** The workers set aside for good: the page draws from now on, beginning with what they were making. */
function giveUpWorkers() {
  const old = lanes ?? [];
  lanes = null;
  // Nothing is made ahead of time on the page's own thread: it would be felt.
  for (const [slot, job] of queued) if (job.use === "ahead") queued.delete(slot);
  for (const lane of old) {
    lane.worker.terminate();
    lane.abort?.();
  }
}

/** The next layer to make: the most pressing waiting, ahead of time only with nothing else waiting and no other being made ahead. */
function nextJob(): Job | null {
  let best: [string, Job] | null = null;
  for (const entry of queued) {
    const [slot, job] = entry;
    if (drawn.has(job.key) || failed.has(job.key) || making.has(job.key)) {
      // Made, or being made for another canvas: this one hears when it is.
      queued.delete(slot);
      continue;
    }
    if (!best || RANK[job.use] < RANK[best[1].use]) best = entry;
  }
  if (!best) return null;
  if (best[1].use === "ahead" && [...making.values()].includes("ahead")) return null;
  queued.delete(best[0]);
  return best[1];
}

function pump() {
  while (queued.size) {
    if (!lanes) {
      // No workers: drawn here, one at a time and a moment later, so a typed letter shows first.
      if (drawingHere) return;
      const job = nextJob();
      if (!job) return;
      drawingHere = true;
      making.set(job.key, job.use);
      window.setTimeout(() => {
        try {
          drawHere(job);
        } finally {
          making.delete(job.key);
          drawingHere = false;
          pump();
        }
      }, 0);
      return;
    }
    const lane = freeLane();
    if (!lane) {
      // Every worker busy, or the workers just set aside: the page's turn, if so.
      if (!lanes) continue;
      return;
    }
    const job = nextJob();
    if (!job) return;
    send(lane, job);
  }
}

function send(lane: Lane, job: Job) {
  const w = lane.worker;
  const id = nextId;
  nextId += 1;
  making.set(job.key, job.use);
  let over = false;
  const end = (field: LiquidField | null | undefined, dead: boolean) => {
    if (over) return;
    over = true;
    window.clearTimeout(watchdog);
    w.removeEventListener("message", onMessage);
    w.removeEventListener("error", onError);
    w.removeEventListener("messageerror", onError);
    lane.abort = null;
    making.delete(job.key);
    try {
      if (dead) {
        // Set the workers aside for good; the page draws from now on, this layer first.
        giveUpWorkers();
        // One made ahead is let go; a canvas that came to wait on it asks again, and the page makes it.
        if (job.use === "ahead") changed();
        else drawHere(job);
      } else if (field === undefined) {
        // The worker could not draw it: neither, most likely, can the page, but it is tried.
        drawHere(job);
      } else {
        settle(job.key, field);
      }
    } finally {
      pump();
    }
  };
  const onMessage = (event: MessageEvent<{ id: number; field: LiquidField | null; error?: string }>) => {
    if (event.data?.id !== id) return;
    end(event.data.error ? undefined : event.data.field, false);
  };
  const onError = () => end(undefined, true);
  const watchdog = window.setTimeout(() => end(undefined, true), PATIENCE_MS);
  lane.abort = onError;
  w.addEventListener("message", onMessage);
  w.addEventListener("error", onError);
  w.addEventListener("messageerror", onError);
  w.postMessage({ id, paint: job.paint, target: job.target });
}

/**
 * Ask for every layer of `ops`, made for a canvas. `slot` names the
 * canvas: what it asked for before and has not yet been sent is dropped,
 * and what it asks for now is kept while it shows it. `use` says how soon
 * it is needed. The canvas hears that a layer is ready through
 * `subscribeLayers`.
 */
export function drawLayers(ops: LiquidOp[], target: LiquidTarget, slot: string, use: LayerUse): void {
  for (const s of [...queued.keys()]) if (s === slot || s.startsWith(`${slot}#`)) queued.delete(s);
  if (use === "ahead" && !lanes) {
    wanted.delete(slot);
    return;
  }
  const keys = ops.map((op) => layerKey(op, target));
  wanted.set(slot, new Set(keys));
  ops.forEach((op, i) => {
    const key = keys[i];
    if (drawn.has(key) || failed.has(key) || making.has(key)) return;
    queued.set(i ? `${slot}#${i}` : slot, {
      key,
      target,
      use,
      paint: { chains: op.chains, colourOf: op.colourOf, tone: op.tone, finish: op.finish, pool: op.pool, seed: op.seed, radius: op.radius },
    });
  });
  pump();
}

/**
 * Every layer of `ops` for a canvas, made: resolves once each is drawn or
 * has failed, true if none failed. For a frame of an animation, which is
 * painted once and let go (`letGo`), never shown again from the cache.
 */
export function layersMade(ops: LiquidOp[], target: LiquidTarget, slot: string, use: LayerUse, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.reject(new DOMException("Called off.", "AbortError"));
  const done = () => ops.every((op) => layerReady(op, target) || layerFailed(op, target));
  drawLayers(ops, target, slot, use);
  if (done()) return Promise.resolve(!ops.some((op) => layerFailed(op, target)));
  return new Promise((resolve, reject) => {
    const stop = () => {
      unsubscribe();
      letGo(slot);
      reject(new DOMException("Called off.", "AbortError"));
    };
    const unsubscribe = subscribeLayers(() => {
      if (!done()) return;
      unsubscribe();
      signal?.removeEventListener("abort", stop);
      resolve(!ops.some((op) => layerFailed(op, target)));
    });
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** A canvas is done with what it asked for: nothing it waits on is made, and what it was shown may be let go. */
export function letGo(slot: string): void {
  for (const s of [...queued.keys()]) if (s === slot || s.startsWith(`${slot}#`)) queued.delete(s);
  wanted.delete(slot);
}
