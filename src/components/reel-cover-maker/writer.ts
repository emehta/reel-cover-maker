/**
 * A word written on, in the page: its ink drawn once at a working size and
 * traced (write-on.ts), then at each frame drawn again at the size it is
 * shown, every pixel as much as the pen has reached it. Each word's trace
 * is kept, and each size's ink, so a frame only reveals.
 */

import type { FaceId } from "@/components/reel-cover-maker/faces";
import { fontCss } from "@/components/reel-cover-maker/fonts";
import { rgb } from "@/components/reel-cover-maker/palettes";
import type { Op } from "@/components/reel-cover-maker/scene";
import { revealAt, revealMap, type RevealMap } from "@/components/reel-cover-maker/write-on";

type TextOp = Extract<Op, { kind: "text" }>;

/** The size a word is traced at, in pixels to the em: strokes a dozen pixels or so across, enough to find their middles. */
const TRACE_SIZE = 180;

/** The clear border round a word's ink, in em: a swash's reach beyond what the face says of it. */
const PAD = 0.08;

/** The most pixels across a written word is drawn at. */
const LARGEST = 2400;

interface Traced {
  map: RevealMap;
  /** The box the trace is of, in em from the word's start on its baseline. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const traced = new Map<string, Traced | null>();
/** Each word's ink at a size it was shown at, and a canvas to draw it written on. */
const inked = new Map<string, { alpha: Uint8ClampedArray; canvas: HTMLCanvasElement; image: ImageData }>();

function trace(face: FaceId, text: string): Traced | null {
  const key = `${face}|${text}`;
  if (traced.has(key)) return traced.get(key) ?? null;
  let made: Traced | null = null;
  const probe = document.createElement("canvas").getContext("2d");
  if (probe) {
    probe.font = fontCss(face, TRACE_SIZE);
    const m = probe.measureText(text);
    const pad = PAD * TRACE_SIZE;
    const left = Math.ceil(m.actualBoundingBoxLeft + pad);
    const top = Math.ceil(m.actualBoundingBoxAscent + pad);
    const w = Math.max(1, Math.ceil(left + m.actualBoundingBoxRight + pad));
    const h = Math.max(1, Math.ceil(top + m.actualBoundingBoxDescent + pad));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.font = fontCss(face, TRACE_SIZE);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = "#000";
      ctx.fillText(text, left, top);
      const data = ctx.getImageData(0, 0, w, h).data;
      const alpha = new Uint8ClampedArray(w * h);
      for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3];
      made = { map: revealMap(alpha, w, h), x: -left / TRACE_SIZE, y: -top / TRACE_SIZE, w: w / TRACE_SIZE, h: h / TRACE_SIZE };
    }
  }
  traced.set(key, made);
  while (traced.size > 64) traced.delete(traced.keys().next().value as string);
  return made;
}

/**
 * The word of `op`, `at` of the way written, drawn for a canvas showing
 * `pixelScale` of its pixels to one of the picture's: a picture, and where
 * it goes in the op's own frame. Null where the page cannot trace it.
 */
export function written(op: TextOp, at: number, pixelScale: number): { image: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null {
  const t = trace(op.face, op.text);
  if (!t) return null;
  const x = op.x + t.x * op.size;
  const y = op.y + t.y * op.size;
  const w = t.w * op.size;
  const h = t.h * op.size;
  const scale = Math.min(pixelScale, LARGEST / Math.max(w, h));
  const W = Math.max(1, Math.round(w * scale));
  const H = Math.max(1, Math.round(h * scale));
  const key = `${op.face}|${op.text}|${W}x${H}`;
  let ink = inked.get(key);
  if (!ink) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const size = (op.size * W) / w;
    ctx.font = fontCss(op.face, size);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#000";
    ctx.fillText(op.text, -t.x * size, -t.y * size);
    const data = ctx.getImageData(0, 0, W, H).data;
    const alpha = new Uint8ClampedArray(W * H);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3];
    ink = { alpha, canvas, image: ctx.createImageData(W, H) };
    inked.set(key, ink);
    while (inked.size > 48) inked.delete(inked.keys().next().value as string);
  }
  const [r, g, b] = rgb(op.color);
  const out = ink.image.data;
  const map = t.map;
  const fx = map.w / W;
  const fy = map.h / H;
  for (let py = 0; py < H; py += 1) {
    const my = Math.min(map.h - 1, Math.floor((py + 0.5) * fy)) * map.w;
    for (let px = 0; px < W; px += 1) {
      const i = py * W + px;
      const a = ink.alpha[i];
      const o = i * 4;
      if (!a) {
        out[o + 3] = 0;
        continue;
      }
      const shown = revealAt(map.time[my + Math.min(map.w - 1, Math.floor((px + 0.5) * fx))], at);
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = Math.round(a * shown);
    }
  }
  const ctx = ink.canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(ink.image, 0, 0);
  return { image: ink.canvas, x, y, w, h };
}
