"use client";

import { useEffect, useRef, useState } from "react";
import { frameTimes, type Plan } from "@/components/reel-cover-maker/animate";
import { layersMade, letGo, liquidLayer } from "@/components/reel-cover-maker/liquid-client";
import type { LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import { paint, type PaintOptions } from "@/components/reel-cover-maker/paint";
import { liquidOps, type LiquidOp } from "@/components/reel-cover-maker/scene";
import { written } from "@/components/reel-cover-maker/writer";

/**
 * An animation played on the page (the owner's ask, 7 Oct: the preview was
 * "a bit too low-res"). Each frame is painted as it is shown, at the
 * canvas's own pixels, so it is as sharp as the cover and as smooth as the
 * screen: type, stickers and written words cost a few milliseconds a frame.
 * Paste is the one thing too slow to make as it plays, so for a cover with
 * paste every frame's layers are made once, ahead (`usePaste`), and laid in
 * as the frames come round, the rest painted round them.
 */

/** Frames a second paste is made for to play: smooth enough for paste laid down, and memory for a few seconds of it. */
export const PASTE_FPS = 24;

/** How long the finished cover stands in a loop before it plays again. */
export const PLAY_HOLD = 1.2;

/** How long the cover must stay as it is before its paste is made again: a slider dragged would otherwise make it for every step. */
const SETTLE_MS = 320;

/** The most a played animation's paste may hold, in bytes. */
const PASTE_BUDGET = 200 * 1024 * 1024;

/** What frames are painted with, besides their scene: the faces, the grain, the photo. */
export interface FrameLook {
  font: PaintOptions["font"];
  grain: CanvasImageSource | null;
  photo: PaintOptions["photo"];
}

export interface PlayRequest {
  /** What it is of: new paste is made for a new key. */
  key: string;
  plan: Plan;
  look: () => FrameLook;
  /** Which canvas asks, for the workers' queue. */
  slot: string;
}

/** A paste layer kept for a frame, and where it goes in the picture's own pixels. */
interface KeptLayer {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every frame's paste, made ahead: for each frame, each paste op's layer and its shadow. */
export interface Paste {
  key: string;
  times: number[];
  frames: { paste: KeptLayer | null; shadow: KeptLayer | null }[][];
}

/** Whether a plan holds paste at all: its last frame is the cover, which holds all there is. */
export function hasPaste(plan: Plan): boolean {
  return liquidOps(plan.frame(plan.duration)).length > 0;
}

/** A lit layer copied out (the GPU's canvas is lit again for the next), where it goes in the picture. */
function keep(layer: ReturnType<typeof liquidLayer>, target: LiquidTarget): KeptLayer | null {
  if (!layer) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, layer.w);
  canvas.height = Math.max(1, layer.h);
  canvas.getContext("2d")?.drawImage(layer.image, layer.sx, layer.sy, layer.w, layer.h, 0, 0, layer.w, layer.h);
  return { image: canvas, x: layer.x / target.scale + target.origin.x, y: layer.y / target.scale + target.origin.y, w: layer.w / target.scale, h: layer.h / target.scale };
}

function release(frames: Paste["frames"] | null | undefined) {
  for (const frame of frames ?? []) {
    for (const op of frame) {
      for (const layer of [op.paste, op.shadow]) {
        if (layer) {
          layer.image.width = 0;
          layer.image.height = 0;
        }
      }
    }
  }
}

/**
 * The paste of `request` for every frame, made for `target` once the cover
 * has settled, and again for each new key; null until made. A plan with no
 * paste needs none: "none".
 */
export function usePaste(request: PlayRequest | null, target: LiquidTarget | null): Paste | "none" | null {
  const [made, setMade] = useState<Paste | null>(null);
  const latest = useRef<{ request: PlayRequest | null; target: LiquidTarget | null }>({ request, target });
  const none = request ? !hasPaste(request.plan) : false;
  const key = request && target && !none ? `${request.key}|${target.width}x${target.height}` : null;

  useEffect(() => {
    latest.current = { request, target };
  });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const frames: Paste["frames"] = [];
    const timer = window.setTimeout(() => {
      const { request: asked, target: full } = latest.current;
      if (!asked || !full) return;
      void (async () => {
        const times = frameTimes(asked.plan.duration, PASTE_FPS);
        // Made smaller where every frame of it at full size would not fit the budget: the finished paste is the largest.
        const last = liquidOps(asked.plan.frame(asked.plan.duration));
        await layersMade(last, full, `${asked.slot}:size`, "thumb", controller.signal);
        const area = last.reduce((sum, op) => {
          const layer = liquidLayer(op, full, "paste");
          return sum + (layer ? layer.w * layer.h * (op.shadow ? 2 : 1) : 0);
        }, 0);
        letGo(`${asked.slot}:size`);
        const bytes = area * 4 * times.length;
        const k = bytes > PASTE_BUDGET ? Math.sqrt(PASTE_BUDGET / bytes) : 1;
        const at: LiquidTarget = k < 1 ? { width: Math.max(1, Math.round(full.width * k)), height: Math.max(1, Math.round(full.height * k)), scale: full.scale * k, origin: full.origin } : full;
        const ahead = 3;
        const opsOf = times.map((t) => liquidOps(asked.plan.frame(t)));
        const ask = (i: number) => layersMade(opsOf[i], at, `${asked.slot}:${i % ahead}`, "thumb", controller.signal);
        const pending: Promise<boolean>[] = [];
        for (let i = 0; i < Math.min(ahead, times.length); i += 1) pending[i] = ask(i);
        try {
          for (let i = 0; i < times.length; i += 1) {
            if (!(await pending[i])) return;
            frames.push(opsOf[i].map((op: LiquidOp) => ({ paste: keep(liquidLayer(op, at, "paste"), at), shadow: op.shadow ? keep(liquidLayer(op, at, "shadow"), at) : null })));
            if (i + ahead < times.length) pending[i + ahead] = ask(i + ahead);
          }
        } finally {
          for (let i = 0; i < ahead; i += 1) letGo(`${asked.slot}:${i}`);
          for (const p of pending) p?.catch(() => {});
        }
        if (controller.signal.aborted) return;
        setMade({ key, times, frames: frames.splice(0) });
      })().catch(() => {
        // Called off, or paste that could not be made: the cover stands still.
      });
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      release(frames.splice(0));
    };
  }, [key]);

  // Paste let go once another has replaced it, or nothing shows it.
  useEffect(() => () => release(made?.frames), [made]);

  if (none) return "none";
  return made && made.key === key ? made : null;
}

interface CanvasProps {
  /** At its own speed: `speed` quickens it as it plays, so its paste, made once, serves every speed. */
  request: PlayRequest;
  speed: number;
  /** The paste made ahead for it, or "none" for a cover without. */
  paste: Paste | "none";
  /** The canvas it is painted on: its pixels, and the window of the picture it shows. */
  target: LiquidTarget;
  className?: string;
}

/**
 * An animation played in a loop, painted frame by frame at the canvas's
 * own pixels: the motion, the cover held, and again. Its clock runs on
 * through a change to the cover, so a slider dragged shows the animation
 * going on rather than starting over.
 */
export function PlayCanvas({ request, speed, paste, target, className }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(request);
  const begun = useRef<number | null>(null);
  const targetKey = [target.width, target.height, target.scale, target.origin.x, target.origin.y].join(",");
  const key = request.key;

  useEffect(() => {
    latest.current = request;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const [width, height, scale, ox, oy] = targetKey.split(",").map(Number);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { plan } = latest.current;
    const look = latest.current.look();
    const origin = { x: ox, y: oy };
    const loop = plan.duration / speed + PLAY_HOLD;
    begun.current ??= performance.now();
    let shown = "";
    let id = 0;
    const tick = (now: number) => {
      // A frame's time can be a moment before the loop began: never before its first frame.
      const played = (Math.max(0, now - (begun.current ?? now)) / 1000) % loop;
      const t = Math.min(plan.duration, played * speed);
      // With paste, the frame it was made for; without, the moment itself.
      const index = paste === "none" ? -1 : Math.min(paste.times.length - 1, Math.floor(t * PASTE_FPS));
      const at = paste === "none" ? t : paste.times[index];
      const step = paste === "none" ? (at >= plan.duration ? "end" : String(at)) : String(index);
      if (step !== shown) {
        shown = step;
        const scene = plan.frame(at);
        const ops = liquidOps(scene);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        paint(ctx, scene, {
          scale,
          origin,
          font: look.font,
          grain: look.grain,
          photo: look.photo,
          written,
          liquid: (op, part) => {
            if (paste === "none") return null;
            const kept = paste.frames[index]?.[ops.indexOf(op)]?.[part];
            if (!kept) return null;
            return { image: kept.image, sx: 0, sy: 0, w: kept.image.width, h: kept.image.height, x: (kept.x - origin.x) * scale, y: (kept.y - origin.y) * scale, dw: kept.w * scale, dh: kept.h * scale };
          },
        });
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [key, speed, paste, targetKey]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
