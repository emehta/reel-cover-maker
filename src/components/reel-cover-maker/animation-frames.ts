/**
 * An animation drawn frame by frame, in the page: each frame's scene from
 * its plan (animate.ts), its paste made by the workers like any other
 * (liquid-client.ts), painted, and handed on, to be played in a loop or put
 * in a video. Three frames are asked for at a time, so both workers stay
 * busy while one is painted; each is let go once painted.
 */

import type { Plan } from "@/components/reel-cover-maker/animate";
import { layersMade, letGo, liquidLayer, type LayerUse } from "@/components/reel-cover-maker/liquid-client";
import type { LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import { paint, type PaintOptions } from "@/components/reel-cover-maker/paint";
import { liquidOps, type Scene } from "@/components/reel-cover-maker/scene";

/** What a frame is drawn with, besides its scene: the canvas it is made for, the faces, grain and photo. */
export interface FrameSetting {
  target: LiquidTarget;
  font: PaintOptions["font"];
  grain: CanvasImageSource | null;
  photo: PaintOptions["photo"];
}

/** How many frames are asked of the workers at once. */
const AHEAD = 3;

/**
 * Each frame of `plan` at `times`, painted on one canvas for `setting` and
 * handed to `onFrame` (which may wait, to copy it) before the next is
 * painted. Rejects with an AbortError once `signal` is aborted, and with an
 * Error if any paste could not be made.
 */
export async function drawFrames(
  plan: Plan,
  times: readonly number[],
  setting: FrameSetting,
  options: { slot: string; use: LayerUse; signal?: AbortSignal; onFrame: (canvas: HTMLCanvasElement, index: number) => Promise<void> | void },
): Promise<void> {
  const { target } = setting;
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas to draw the frames on.");
  const scenes: Scene[] = times.map((t) => plan.frame(t));
  const slotOf = (i: number) => `${options.slot}:${i % AHEAD}`;
  const ask = (i: number) => layersMade(liquidOps(scenes[i]), target, slotOf(i), options.use, options.signal);
  const pending: Promise<boolean>[] = [];
  for (let i = 0; i < Math.min(AHEAD, scenes.length); i += 1) pending[i] = ask(i);
  try {
    for (let i = 0; i < scenes.length; i += 1) {
      if (!(await pending[i])) throw new Error("A frame's paste could not be made.");
      if (options.signal?.aborted) throw new DOMException("Called off.", "AbortError");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paint(ctx, scenes[i], { scale: target.scale, origin: target.origin, font: setting.font, grain: setting.grain, liquid: (op, part) => liquidLayer(op, target, part) ?? null, photo: setting.photo });
      await options.onFrame(canvas, i);
      if (i + AHEAD < scenes.length) pending[i + AHEAD] = ask(i + AHEAD);
    }
  } finally {
    for (let i = 0; i < AHEAD; i += 1) letGo(slotOf(i));
    // Settle any asked for and not waited on, so none is left unhandled.
    for (const p of pending) p?.catch(() => {});
  }
}

/** A frame kept to be played: a bitmap where the browser makes one, else a copy on a canvas of its own. */
export type KeptFrame = ImageBitmap | HTMLCanvasElement;

export async function keepFrame(canvas: HTMLCanvasElement): Promise<KeptFrame> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(canvas);
    } catch {
      // Fall through to a copy.
    }
  }
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d")?.drawImage(canvas, 0, 0);
  return copy;
}

/** Frames no longer to be played, their memory handed back. */
export function dropFrames(frames: readonly KeptFrame[] | null | undefined): void {
  for (const f of frames ?? []) {
    if ("close" in f) f.close();
    else {
      f.width = 0;
      f.height = 0;
    }
  }
}

/** A canvas as a PNG. */
export function pngOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The canvas made no picture."))), "image/png"));
}
