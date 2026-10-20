/**
 * A word written on, in the page: its ink drawn once at a working size and
 * traced (write-on.ts), then at each frame drawn again at the size it is
 * shown, every pixel as much as the pen has reached it. Each word's trace
 * is kept, and each size's ink, so a frame only reveals. A word is a
 * typeface's text, or Inkblot's printed outline, drawn as the cover draws it.
 */

import { fontCss } from "@/components/reel-cover-maker/fonts";
import { loopBounds } from "@/components/reel-cover-maker/ink";
import { rgb } from "@/components/reel-cover-maker/palettes";
import type { Op } from "@/components/reel-cover-maker/scene";
import { revealAt, revealMap, type RevealMap } from "@/components/reel-cover-maker/write-on";

type WordOp = Extract<Op, { kind: "text" | "ink" }>;

/** The size a word is traced at, in pixels to the em: strokes a dozen pixels or so across, enough to find their middles. */
const TRACE_SIZE = 180;

/** The clear border round a word's ink, in em: a swash's reach beyond what the face says of it. */
const PAD = 0.08;

/** The most pixels across a written word is drawn at. */
const LARGEST = 2400;

interface Traced {
  map: RevealMap;
  /** The box the trace is of, in em from the word's anchor. */
  x: number;
  y: number;
  w: number;
  h: number;
}

const traced = new Map<string, Traced | null>();
/** Each word's ink at a size it was shown at, and a canvas to draw it written on. */
const inked = new Map<string, { alpha: Uint8ClampedArray; canvas: HTMLCanvasElement; image: ImageData }>();

/**
 * What a word's trace is measured from, in pixels of the picture: a text's
 * start on its baseline, or the top left of printed ink, so the same word
 * printed in two places is traced once. With its pixels to the em, and what
 * its trace is kept by.
 */
function anchor(op: WordOp): { x: number; y: number; size: number; key: string } {
  if (op.kind === "text") return { x: op.x, y: op.y, size: op.size, key: `${op.face}|${op.text}|${op.sx ?? 1}|${((op.bold ?? 0) / op.size).toFixed(4)}|${((op.nib ?? 0) / op.size).toFixed(4)}` };
  const b = loopBounds(op.polygons);
  return { x: b?.x0 ?? 0, y: b?.y0 ?? 0, size: op.size, key: `ink|${op.key}` };
}

/** A word's ink drawn black into `ctx`, `scale` canvas pixels to its em, its anchor at (x, y). */
function drawInk(ctx: CanvasRenderingContext2D, op: WordOp, scale: number, x: number, y: number) {
  ctx.fillStyle = "#000";
  if (op.kind === "text") {
    ctx.font = fontCss(op.face, scale);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(op.sx ?? 1, 1);
    // A script thickened to its capitals' weight is written thickened: a broad pen's copies across, a stroke round.
    const nib = ((op.nib ?? 0) * scale) / op.size;
    const steps = nib > 0 ? Math.min(64, Math.max(2, Math.ceil(nib))) : 0;
    for (let i = 0; i <= steps; i += 1) {
      const dx = steps ? (nib * i) / steps : 0;
      ctx.fillText(op.text, dx, 0);
      if (op.bold) {
        ctx.strokeStyle = "#000";
        ctx.lineJoin = "round";
        ctx.lineWidth = (op.bold * scale) / op.size;
        ctx.strokeText(op.text, dx, 0);
      }
    }
    ctx.restore();
    return;
  }
  const at = anchor(op);
  const k = scale / op.size;
  ctx.beginPath();
  for (const p of op.polygons) {
    ctx.moveTo(x + (p[0] - at.x) * k, y + (p[1] - at.y) * k);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(x + (p[i] - at.x) * k, y + (p[i + 1] - at.y) * k);
    ctx.closePath();
  }
  ctx.fill();
}

/** How far a word's ink reaches from its anchor, in em: left of it and above it, right of it and below it. */
function inkBox(op: WordOp, probe: CanvasRenderingContext2D): { left: number; top: number; right: number; bottom: number } {
  if (op.kind === "text") {
    probe.font = fontCss(op.face, TRACE_SIZE);
    const m = probe.measureText(op.text);
    const sx = op.sx ?? 1;
    const pad = (op.bold ?? 0) / 2 / op.size;
    return { left: (m.actualBoundingBoxLeft * sx) / TRACE_SIZE + pad, top: m.actualBoundingBoxAscent / TRACE_SIZE + pad, right: (m.actualBoundingBoxRight * sx) / TRACE_SIZE + pad + (op.nib ?? 0) / op.size, bottom: m.actualBoundingBoxDescent / TRACE_SIZE + pad };
  }
  const b = loopBounds(op.polygons);
  return b ? { left: 0, top: 0, right: (b.x1 - b.x0) / op.size, bottom: (b.y1 - b.y0) / op.size } : { left: 0, top: 0, right: 0, bottom: 0 };
}

function trace(op: WordOp): Traced | null {
  const key = anchor(op).key;
  if (traced.has(key)) return traced.get(key) ?? null;
  let made: Traced | null = null;
  const probe = document.createElement("canvas").getContext("2d");
  if (probe) {
    const box = inkBox(op, probe);
    const pad = PAD * TRACE_SIZE;
    const left = Math.ceil(box.left * TRACE_SIZE + pad);
    const top = Math.ceil(box.top * TRACE_SIZE + pad);
    const w = Math.max(1, Math.ceil(left + box.right * TRACE_SIZE + pad));
    const h = Math.max(1, Math.ceil(top + box.bottom * TRACE_SIZE + pad));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      drawInk(ctx, op, TRACE_SIZE, left, top);
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
export function written(op: WordOp, at: number, pixelScale: number): { image: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null {
  const t = trace(op);
  if (!t) return null;
  const from = anchor(op);
  const x = from.x + t.x * from.size;
  const y = from.y + t.y * from.size;
  const w = t.w * from.size;
  const h = t.h * from.size;
  const scale = Math.min(pixelScale, LARGEST / Math.max(w, h));
  const W = Math.max(1, Math.round(w * scale));
  const H = Math.max(1, Math.round(h * scale));
  const key = `${from.key}|${W}x${H}`;
  let ink = inked.get(key);
  if (!ink) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const size = (from.size * W) / w;
    drawInk(ctx, op, size, -t.x * size, -t.y * size);
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
