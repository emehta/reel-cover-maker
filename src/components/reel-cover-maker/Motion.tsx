"use client";

import { useEffect, useRef, useState } from "react";
import type { Plan } from "@/components/reel-cover-maker/animate";
import { frameTimes } from "@/components/reel-cover-maker/animate";
import { drawFrames, dropFrames, keepFrame, type FrameSetting, type KeptFrame } from "@/components/reel-cover-maker/animation-frames";

/** An animation drawn and kept, to be played in a loop: its frames, as fast as they go, and how long the last is held. */
export interface Motion {
  /** What it is of: shown only while it is still what is asked for. */
  key: string;
  frames: KeptFrame[];
  fps: number;
  /** How long the finished cover stands before the loop begins again, in seconds. */
  hold: number;
}

export interface MotionRequest {
  /** What the frames would be of: a new key draws them again. */
  key: string;
  plan: Plan;
  /** What the frames are drawn with, asked for only when they are drawn. */
  setting: () => FrameSetting;
  /** Which canvas asks, for the workers' queue. */
  slot: string;
}

/** Frames a second a motion is played at on the page: smooth enough for type and paste, and half the memory of 48. */
export const PLAY_FPS = 24;

/** How long the finished cover stands in a loop before it plays again. */
export const PLAY_HOLD = 1.2;

/** How long the cover must stay as it is before its frames are drawn: typing would otherwise draw them for every letter. */
const SETTLE_MS = 320;

/**
 * The frames of `request`, drawn once the cover has settled, and drawn
 * again for each new key; null until the first is ready, and the last one
 * made while the next is drawn (its `key` says which it is). Frames let go
 * are handed back as soon as nothing shows them.
 */
export function useMotion(request: MotionRequest | null): Motion | null {
  const [motion, setMotion] = useState<Motion | null>(null);
  const latest = useRef<MotionRequest | null>(request);
  const key = request?.key ?? null;

  useEffect(() => {
    latest.current = request;
  });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const made: KeptFrame[] = [];
    const timer = window.setTimeout(() => {
      const asked = latest.current;
      if (!asked || asked.key !== key) return;
      const times = frameTimes(asked.plan.duration, PLAY_FPS);
      void drawFrames(asked.plan, times, asked.setting(), {
        slot: asked.slot,
        use: "thumb",
        signal: controller.signal,
        onFrame: async (canvas) => {
          made.push(await keepFrame(canvas));
        },
      }).then(
        () => {
          if (controller.signal.aborted) return;
          setMotion({ key, frames: made.splice(0), fps: PLAY_FPS, hold: PLAY_HOLD });
        },
        () => {
          // Called off, or a paste could not be made: the cover stands still, as it is.
        },
      );
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      dropFrames(made.splice(0));
    };
  }, [key]);

  // A motion's frames handed back once another has replaced it, or nothing shows it.
  useEffect(() => () => dropFrames(motion?.frames), [motion]);

  return motion;
}

interface CanvasProps {
  motion: Motion;
  /** The part of each frame to show, in its own pixels: the profile grid's window, on the phone. Unset, all of it. */
  crop?: { x: number; y: number; w: number; h: number };
  className?: string;
}

/** A motion played in a loop: the motion, the cover held, and again. */
export function MotionCanvas({ motion, crop, className }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The crop by value: a new object each render must not start the loop again.
  const cropKey = crop ? [crop.x, crop.y, crop.w, crop.h].join(",") : "";
  useEffect(() => {
    const canvas = ref.current;
    const first = motion.frames[0];
    if (!canvas || !first) return;
    const [cx, cy, cw, ch] = cropKey ? cropKey.split(",").map(Number) : [0, 0, first.width, first.height];
    const region = { x: cx, y: cy, w: cw, h: ch };
    canvas.width = Math.max(1, Math.round(region.w));
    canvas.height = Math.max(1, Math.round(region.h));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const count = motion.frames.length;
    const loop = (count - 1) / motion.fps + motion.hold;
    const start = performance.now();
    let shown = -1;
    let id = 0;
    const tick = (now: number) => {
      // A frame's time can be a moment before the loop began: never before its first frame.
      const t = (Math.max(0, now - start) / 1000) % loop;
      const index = Math.min(count - 1, Math.floor(t * motion.fps));
      if (index !== shown) {
        shown = index;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(motion.frames[index], region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [motion, cropKey]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
