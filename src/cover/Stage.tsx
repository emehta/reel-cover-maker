"use client";

/**
 * Reelic's cover for the projects page, drawn a frame at a time from the
 * maker's own engine (buildScene, paint, the paste's field and the GPU
 * light), never recorded and never redrawn by hand: every cover in it is
 * one the maker makes from the same title and colour.
 *
 * One take, 1600 by 2000 (twice the card's 800 by 1000, the 4:5 of every
 * card on the page), the reel shown close as the feed shows it, its middle
 * 4:5: "day one" in blue gel; it clears, "rate my setup" is typed and
 * "setup" made bold, as the maker marks Stickery's script word; the sticker
 * is made; the camera draws back until the cover is the newest post of a
 * feed of nine, its grid window, holds, and goes back in; it clears, "day
 * one" is typed and piped along its own strokes in the order they are
 * written, its drips falling after; and the last frame is the first.
 *
 * `window.STAGE.seek(t)` draws the frame at t seconds; a renderer reads the
 * canvas after each.
 */

import { useEffect, useRef } from "react";
import type { FaceId } from "@/components/reel-cover-maker/faces";
import { facesFor, fontCss, fontsSnapshot, interTight, measurerFor, requestFonts } from "@/components/reel-cover-maker/fonts";
import type { Bead, Chain } from "@/components/reel-cover-maker/liquid";
import { shadeOnGpu } from "@/components/reel-cover-maker/liquid-gl";
import { liquidField, type LiquidField, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import { paint, type PaintOptions } from "@/components/reel-cover-maker/paint";
import { GROUNDS, paletteFor, rgb, type Ground } from "@/components/reel-cover-maker/palettes";
import {
  buildScene,
  letteringFace,
  liquidOps,
  type CoverInput,
  type LetteringId,
  type LiquidOp,
  type Op,
  type PastyLetteringId,
  type Scene,
  type StyleId,
} from "@/components/reel-cover-maker/scene";
import { clamp01, easeOut, glide, keystrokes, sine, span, typedCount } from "@/cover/timeline";

const FPS = 60;
const W = 1600;
const H = 2000;
/** Canvas pixels per pixel of the 1080-wide cover, when it fills the card. */
const SCALE = W / 1080;
/** The profile grid's window on a reel cover, in its pixels. */
const WINDOW_Y = 240;
const WINDOW_H = 1440;
/**
 * All the way in, the card shows the reel as the feed does, its middle 4:5,
 * with the grid's 3:4 window 67 pixels past the card's top: a whole number,
 * so the newest post drawn there is the card pixel for pixel.
 */
const IN_TOP = -67;
const HERO: LiquidTarget = { width: W, height: H, scale: SCALE, origin: { x: 0, y: WINDOW_Y - IN_TOP / SCALE } };
const TILE: LiquidTarget = { width: W, height: Math.ceil(WINDOW_H * SCALE), scale: SCALE, origin: { x: 0, y: WINDOW_Y } };
const TILE_SRC_H = WINDOW_H * SCALE;
/** The feed: three by three 3:4 posts eight pixels apart, as tall as the card and centred across it, so none is cut. */
const GAP = 8;
const TILE_H = (H - 2 * GAP) / 3;
const TILE_W = (TILE_H * 3) / 4;
const FEED_X = (W - 3 * TILE_W - 2 * GAP) / 2;
/** How far in the camera is when one post fills the card. */
const ZOOM = W / TILE_W;

const GUTTER = "#FFFFFF";
const TYPED_INK = "#1B1A18";
const TYPED_SIZE = 156;

interface Spec {
  title: string;
  style: StyleId;
  hue: number;
  shade: number;
  ground: Ground;
  lettering?: LetteringId;
  pastyLettering?: PastyLetteringId;
}

/** The poster: the cover the loop begins and ends on. */
const DAY_ONE: Spec = { title: "day one", style: "pasty", hue: 258, shade: 0.45, ground: "light" };
/** The cover made in the middle, and the newest post of the feed. */
const SETUP: Spec = { title: "rate my *setup*", style: "stickery", hue: 352, shade: 0.55, ground: "light" };

/** The feed, row by row; light and dark grounds in turn, no two neighbours one colour. */
const FEED: Spec[] = [
  SETUP,
  { title: "part two", style: "pasty", hue: 62, shade: 0.72, ground: "dark" },
  { title: "lisbon diaries", style: "editorial", hue: 258, shade: 0.42, ground: "light" },
  { title: "desk tour", style: "pasty-flat", hue: 150, shade: 0.64, ground: "dark" },
  { title: "get *ready*", style: "stickery", hue: 302, shade: 0.5, ground: "light", lettering: "leckerli" },
  { title: "golden hour", style: "pasty-flat", hue: 95, shade: 0.84, ground: "dark" },
  { title: "studio tour", style: "pasty", hue: 210, shade: 0.48, ground: "light", pastyLettering: "goo-even" },
  { title: "night *out*", style: "stickery", hue: 26, shade: 0.58, ground: "dark", lettering: "damion" },
  { title: "slow sundays", style: "editorial", hue: 150, shade: 0.42, ground: "light" },
];

function inputOf(spec: Spec): CoverInput {
  return {
    title: spec.title,
    style: spec.style,
    lettering: spec.lettering ?? "yesteryear",
    plainFace: "plain-outfit",
    pastyLettering: spec.pastyLettering ?? "goo",
    photo: false,
    hue: spec.hue,
    shade: spec.shade,
    ground: spec.ground,
    format: "reel",
    seed: 0,
  };
}

function facesOf(spec: Spec): FaceId[] {
  return facesFor("plain-outfit", letteringFace(spec.lettering ?? "yesteryear"));
}

/* ---- The beats, in seconds. ---- */

const T = (() => {
  const clearA = { from: 1.4, to: 2.0 };
  const caretB = 1.88;
  const typeB = keystrokes("rate my setup", 2.25, 11);
  const typedB = typeB[typeB.length - 1] + 0.1;
  const select = { from: typedB + 0.25, to: typedB + 0.55 };
  const bold = { from: select.to + 0.15, to: select.to + 0.45 };
  // The typed line is gone before the first letter of the sticker is drawn.
  const fadeB = { from: bold.to + 0.3, to: bold.to + 0.6 };
  const make = fadeB.to - 0.2;
  const made = make + 1.3;
  const away = { from: made + 1.0, to: made + 3.2 };
  const back = { from: away.to + 2.3, to: away.to + 4.2 };
  const clearB = { from: back.to + 0.5, to: back.to + 1.05 };
  const caretA = clearB.to - 0.12;
  const typeA = keystrokes("day one", clearB.to + 0.3, 7);
  const typedA = typeA[typeA.length - 1] + 0.1;
  const fadeA = { from: typedA + 0.3, to: typedA + 0.6 };
  const pipe = fadeA.to - 0.05;
  return { clearA, caretB, typeB, select, bold, fadeB, make, made, away, back, clearB, caretA, typeA, fadeA, pipe };
})();

/* ---- Drawing helpers. ---- */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

/** Paint's liquid layers for a target, lit on the GPU as the maker lights them; a field is made once an op. */
function lighter(target: LiquidTarget, fieldOf: (op: LiquidOp) => LiquidField | null): NonNullable<PaintOptions["liquid"]> {
  return (op, part) => {
    const field = fieldOf(op);
    if (!field) return null;
    const gpu = shadeOnGpu(field, { colours: op.colours, ground: op.ground, under: op.under, shadow: part === "shadow" }, op.seed);
    if (!gpu) throw new Error("no WebGL 2: the stage lights paste on the GPU only");
    return { image: gpu.canvas, sx: gpu.sx, sy: gpu.sy, w: field.w, h: field.h, x: field.x, y: field.y };
  };
}

function cachedFields(target: LiquidTarget) {
  const fields = new Map<LiquidOp, LiquidField | null>();
  return (op: LiquidOp) => {
    if (!fields.has(op)) fields.set(op, liquidField({ chains: op.chains, colourOf: op.colourOf, tone: op.tone, finish: op.finish, pool: op.pool, seed: op.seed }, target));
    return fields.get(op) ?? null;
  };
}

function paintOptions(target: LiquidTarget, liquid: PaintOptions["liquid"]): PaintOptions {
  return { scale: target.scale, origin: target.origin, font: fontCss, grain: null, liquid };
}

/** A cover on its ground, as it reads once posted: the maker's clear PNG laid on the colour it was lit for. */
function coverCanvas(scene: Scene, ground: Ground, target: LiquidTarget, ops?: Op[]): HTMLCanvasElement {
  const [c, ctx] = canvas(target.width, target.height);
  ctx.fillStyle = GROUNDS[ground];
  ctx.fillRect(0, 0, c.width, c.height);
  paint(ctx, ops ? { ...scene, ops } : scene, paintOptions(target, lighter(target, cachedFields(target))));
  return c;
}

/* ---- Piping: the paste laid along its own strokes, in the order they are written. ---- */

interface Stroke {
  chain: Chain;
  index: number;
  /** The paste laid by each bead, from the first: its length times its section, so a swelling end fills as slowly as it would squeezed out. */
  at: number[];
  start: number;
  end: number;
  drip: boolean;
}

const same = (a: Bead, b: Bead) => a.x === b.x && a.y === b.y && a.r === b.r;

/** Each chain's moment: strokes one after another as a hand pipes them, a drip falling once its stem is done. */
function pipingPlan(op: LiquidOp, start: number): { strokes: Stroke[]; done: number; radius: number } {
  const lengths = op.chains.map((c) => {
    const at = [0];
    for (let i = 1; i < c.length; i += 1) {
      const r = (c[i].r + c[i - 1].r) / 2;
      at.push(at[i - 1] + Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y) * r * r);
    }
    return at;
  });
  const parentOf = (j: number): number => {
    const c = op.chains[j];
    if (j >= op.letters || c.length < 3) return -1;
    const first = c[0];
    const last = c[c.length - 1];
    if (!(last.y - first.y > first.r * 1.5 && Math.abs(last.x - first.x) < last.y - first.y)) return -1;
    for (let i = j - 1; i >= 0; i -= 1) {
      if (op.glyphOf[i] !== op.glyphOf[j]) continue;
      const p = op.chains[i];
      if (p.length && (same(p[0], first) || same(p[p.length - 1], first))) return i;
    }
    return -1;
  };
  const flowTotal = op.chains.reduce((sum, c, j) => sum + (parentOf(j) < 0 ? lengths[j][lengths[j].length - 1] : 0), 0);
  // An even flow of paste, about two seconds of it in all.
  const speed = flowTotal / 1.9;
  const strokes: Stroke[] = [];
  let t = start;
  let glyph = -1;
  op.chains.forEach((chain, j) => {
    const parent = parentOf(j);
    if (parent >= 0) {
      const from = strokes[parent].end + 0.04;
      strokes.push({ chain, index: j, at: lengths[j], start: from, end: from + 0.85, drip: true });
      return;
    }
    const g = j < op.letters ? op.glyphOf[j] : -2 - j;
    if (strokes.length) t += g !== glyph ? 0.085 : 0.045;
    glyph = g;
    const length = lengths[j][lengths[j].length - 1];
    const duration = chain.length < 2 ? 0.12 : Math.max(0.08, length / speed);
    strokes.push({ chain, index: j, at: lengths[j], start: t, end: t + duration, drip: false });
    t += duration;
  });
  const radii = op.chains.flatMap((c) => c.map((b) => b.r)).sort((p, q) => p - q);
  return { strokes, done: Math.max(...strokes.map((s) => s.end)), radius: Math.max(0.5 / SCALE, radii[Math.floor(radii.length / 2)]) };
}

/** A stroke as far as it has been piped at time t: cut at its length so far, a drip stretched down from its foot. */
function pipedChain(s: Stroke, t: number): Chain | null {
  const u = span(t, s.start, s.end);
  if (u <= 0) return null;
  if (u >= 1) return s.chain;
  if (s.drip) {
    const q = sine(u);
    const foot = s.chain[0];
    return s.chain.map((b) => ({ x: foot.x + (b.x - foot.x) * q, y: foot.y + (b.y - foot.y) * q, r: b.r }));
  }
  if (s.chain.length < 2) {
    const b = s.chain[0];
    return [{ ...b, r: b.r * (0.35 + 0.65 * easeOut(u)) }];
  }
  // A hand gathers pace and slows to a stop.
  const along = (u * 0.5 + sine(u) * 0.5) * s.at[s.at.length - 1];
  let k = 0;
  while (k < s.at.length - 2 && s.at[k + 1] <= along) k += 1;
  const f = clamp01((along - s.at[k]) / Math.max(1e-6, s.at[k + 1] - s.at[k]));
  const a = s.chain[k];
  const b = s.chain[k + 1];
  return [...s.chain.slice(0, k + 1), { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: a.r + (b.r - a.r) * f }];
}

/* ---- The stage. ---- */

interface Built {
  draw: (t: number) => void;
  duration: number;
}

async function waitForFonts(specs: Spec[]): Promise<number> {
  for (const s of specs) requestFonts(s.title, facesOf(s));
  const family = interTight.style.fontFamily;
  await document.fonts.load(`400 ${TYPED_SIZE}px ${family}`, "rate my setup day one");
  for (let i = 0; i < 400; i += 1) {
    const snaps = specs.map((s) => fontsSnapshot(s.title, facesOf(s)));
    if (snaps.every((v) => v >= 0)) {
      await new Promise((r) => setTimeout(r, 200));
      const again = specs.map((s) => fontsSnapshot(s.title, facesOf(s)));
      if (again.every((v) => v >= 0) && again.every((v) => v === again[0])) return again[0];
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("fonts never arrived");
}

async function build(main: HTMLCanvasElement): Promise<Built> {
  (globalThis as { __reelicStage?: boolean }).__reelicStage = true;
  const loads = await waitForFonts([DAY_ONE, ...FEED]);
  const measurer = measurerFor(loads);
  const sceneOf = (spec: Spec) => buildScene(inputOf(spec), measurer);

  const ctx = main.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // The poster, piped.
  const dayOne = sceneOf(DAY_ONE);
  const [pasteA] = liquidOps(dayOne);
  if (!pasteA) throw new Error("day one has no paste");
  const plan = pipingPlan(pasteA, T.pipe);
  const pipedScene = (t: number): Scene => {
    const chains: Chain[] = [];
    const colourOf: number[] = [];
    const tone: number[] = [];
    for (const s of plan.strokes) {
      const c = pipedChain(s, t);
      if (!c) continue;
      chains.push(c);
      colourOf.push(pasteA.colourOf[s.index]);
      tone.push(pasteA.tone[s.index]);
    }
    const op: LiquidOp = { ...pasteA, chains, colourOf, tone, letters: chains.length };
    return { ...dayOne, ops: dayOne.ops.map((o) => (o === pasteA ? op : o)) };
  };
  const pinnedField = (op: LiquidOp) =>
    op.chains.length ? liquidField({ chains: op.chains, colourOf: op.colourOf, tone: op.tone, finish: op.finish, pool: op.pool, seed: pasteA.seed, radius: plan.radius }, HERO) : null;
  const drawDayOne = (target: CanvasRenderingContext2D, scene: Scene) => {
    const fields = new Map<LiquidOp, LiquidField | null>();
    const fieldOf = (op: LiquidOp) => {
      if (!fields.has(op)) fields.set(op, pinnedField(op));
      return fields.get(op) ?? null;
    };
    paint(target, scene, paintOptions(HERO, lighter(HERO, fieldOf)));
  };
  const [posterCanvas, posterCtx] = canvas(W, H);
  posterCtx.fillStyle = GROUNDS.light;
  posterCtx.fillRect(0, 0, W, H);
  drawDayOne(posterCtx, pipedScene(Infinity));

  // The sticker, and its parts for the making.
  const setup = sceneOf(SETUP);
  const setupCanvas = coverCanvas(setup, SETUP.ground, HERO);
  const paper = setup.ops.filter((op) => op.kind === "shape");
  const funky = setup.ops.filter((op): op is Extract<Op, { kind: "turn" }> => op.kind === "turn");
  const plain = setup.ops.filter((op): op is Extract<Op, { kind: "text" }> & { settled?: number } => op.kind === "text");
  const paperCanvas = coverCanvasClear(setup, paper);
  const funkyCanvas = coverCanvasClear(setup, funky);
  const setupPalette = paletteFor({ hue: SETUP.hue, shade: SETUP.shade, ground: SETUP.ground });

  function coverCanvasClear(scene: Scene, ops: Op[]): HTMLCanvasElement {
    const [c, cctx] = canvas(W, H);
    paint(cctx, { ...scene, ops }, paintOptions(HERO, lighter(HERO, cachedFields(HERO))));
    return c;
  }

  // The paper is pressed on under the letters, settling from a touch larger, about its own middle.
  const paperBox = (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const op of paper)
      if (op.kind === "shape")
        for (const poly of op.polygons)
          for (let i = 0; i < poly.length; i += 2) {
            x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
            y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]);
          }
    return { cx: (((x0 + x1) / 2 - HERO.origin.x) * SCALE), cy: (((y0 + y1) / 2 - HERO.origin.y) * SCALE) };
  })();
  const [workCanvas, workCtx] = canvas(W, H);

  // The rest of the feed, each post its grid window.
  const tiles = FEED.map((spec, i) => coverCanvas(i === 0 ? setup : sceneOf(spec), spec.ground, TILE));
  const [feedCanvas, feedCtx] = canvas(W, H);

  const family = interTight.style.fontFamily;
  const typedFont = `400 ${TYPED_SIZE}px ${family}`;

  /** The typed line, as the maker's text field holds it: set from where the whole line will start, so it never shifts. */
  function typed(target: CanvasRenderingContext2D, text: string, count: number, alpha: number, caret: number, select = 0, bold = 0) {
    if (alpha <= 0) return;
    target.save();
    target.globalAlpha = alpha;
    target.font = typedFont;
    target.textBaseline = "alphabetic";
    const full = target.measureText(text).width;
    const cap = target.measureText("H").actualBoundingBoxAscent;
    const x0 = (W - full) / 2;
    const base = H / 2 + cap / 2;
    const shown = text.slice(0, count);
    const word = text.lastIndexOf(" ") + 1;
    if (select > 0) {
      const sx = x0 + target.measureText(text.slice(0, word)).width;
      const sw = target.measureText(text.slice(word)).width;
      const [r, g, b] = rgb(setupPalette.ink);
      target.fillStyle = `rgba(${r}, ${g}, ${b}, 0.24)`;
      target.fillRect(sx - 6, base - cap * 1.32, (sw + 12) * easeOut(select), cap * 1.72);
    }
    target.fillStyle = TYPED_INK;
    target.fillText(shown, x0, base);
    if (bold > 0 && count === text.length) {
      // Bold as the maker's field shows it: the word stroked thicker, its width kept.
      target.strokeStyle = TYPED_INK;
      target.lineJoin = "round";
      target.lineWidth = TYPED_SIZE * 0.05 * sine(bold);
      target.strokeText(text.slice(word), x0 + target.measureText(text.slice(0, word)).width, base);
    }
    if (caret > 0) {
      target.globalAlpha = alpha * caret;
      target.fillRect(x0 + target.measureText(shown).width + 9, base - cap * 1.22, 9, cap * 1.6);
    }
    target.restore();
  }

  /** The caret: in a moment before the first key, steady while typing. */
  function caretAt(t: number, from: number): number {
    const on = span(t, from, from + 0.12);
    return on;
  }

  /** The sticker being made: its script word written on, the plain words settling onto it, its paper growing out from them. */
  function making(target: CanvasRenderingContext2D, t: number) {
    const m = T.make;
    // Paper first in the stack, pressed on as the words land.
    const press = span(t, m + 0.62, m + 0.97);
    if (press > 0) {
      const grow = 1 + 0.025 * (1 - easeOut(press));
      target.save();
      target.globalAlpha = sine(press);
      target.translate(paperBox.cx, paperBox.cy);
      target.scale(grow, grow);
      target.translate(-paperBox.cx, -paperBox.cy);
      target.drawImage(paperCanvas, 0, 0);
      target.restore();
    }
    // The script word, written on along its own slant.
    const write = sine(span(t, m + 0.05, m + 0.85));
    if (write > 0) {
      workCtx.globalCompositeOperation = "copy";
      workCtx.drawImage(funkyCanvas, 0, 0);
      workCtx.globalCompositeOperation = "destination-in";
      for (const op of funky) {
        const inner = op.ops.filter((o): o is Extract<Op, { kind: "text" }> => o.kind === "text");
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const o of inner) {
          workCtx.font = fontCss(o.face, o.size);
          x0 = Math.min(x0, o.x);
          x1 = Math.max(x1, o.x + workCtx.measureText(o.text).width);
        }
        const pad = (x1 - x0) * 0.12;
        const feather = (x1 - x0) * 0.06;
        const edge = x0 - pad + write * (x1 - x0 + 2 * pad + feather);
        workCtx.save();
        workCtx.setTransform(SCALE, 0, 0, SCALE, -HERO.origin.x * SCALE, -HERO.origin.y * SCALE);
        workCtx.translate(op.cx, op.cy);
        workCtx.rotate(op.angle);
        workCtx.translate(-op.cx, -op.cy);
        const g = workCtx.createLinearGradient(edge - feather, 0, edge, 0);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        workCtx.fillStyle = g;
        workCtx.fillRect(x0 - 4000, op.cy - 4000, 8000 + (x1 - x0), 8000);
        workCtx.restore();
      }
      workCtx.globalCompositeOperation = "source-over";
      target.drawImage(workCanvas, 0, 0);
    }
    // The plain words, each dropping the way the maker settled it.
    plain.forEach((op, i) => {
      const u = span(t, m + 0.45 + i * 0.09, m + 1.0 + i * 0.09);
      if (u <= 0) return;
      const travel = op.settled ?? 0;
      const moved = { ...op, y: op.y - travel * (1 - easeOut(u)), alpha: sine(span(u, 0, 0.45)) };
      paint(target, { ...setup, ops: [moved] }, paintOptions(HERO, undefined));
    });
  }

  /** The feed at a zoom, the camera drawing back about a point near its top left, so every post travels in a straight line. */
  function feed(target: CanvasRenderingContext2D, zoom: number) {
    if (Math.abs(zoom - ZOOM) < 1e-6) {
      // All the way in, the sticker is the card pixel for pixel, never resampled.
      target.drawImage(setupCanvas, 0, 0);
      return;
    }
    const f = (zoom - 1) / (ZOOM - 1);
    const tx = -ZOOM * FEED_X * f;
    const ty = IN_TOP * f;
    feedCtx.fillStyle = GUTTER;
    feedCtx.fillRect(0, 0, W, H);
    tiles.forEach((tile, i) => {
      const x = zoom * (FEED_X + (i % 3) * (TILE_W + GAP)) + tx;
      const y = zoom * Math.floor(i / 3) * (TILE_H + GAP) + ty;
      const w = zoom * TILE_W;
      const h = zoom * TILE_H;
      if (x > W || y > H || x + w < 0 || y + h < 0) return;
      feedCtx.drawImage(tile, 0, 0, W, TILE_SRC_H, x, y, w, h);
    });
    target.drawImage(feedCanvas, 0, 0);
  }

  const duration = Math.ceil((plan.done + 0.75) * FPS) / FPS;
  const typedB = (t: number) => 1 - sine(span(t, T.fadeB.from, T.fadeB.to));

  function draw(t: number) {
    ctx!.save();
    ctx!.globalCompositeOperation = "source-over";
    ctx!.globalAlpha = 1;
    const cream = () => {
      ctx!.fillStyle = GROUNDS.light;
      ctx!.fillRect(0, 0, W, H);
    };
    if (t < T.clearA.to) {
      // The poster, then its letters fading off the ground.
      cream();
      ctx!.globalAlpha = 1 - sine(span(t, T.clearA.from, T.clearA.to));
      ctx!.drawImage(posterCanvas, 0, 0);
      ctx!.globalAlpha = 1;
      typed(ctx!, "rate my setup", 0, 1, caretAt(t, T.caretB));
    } else if (t < T.make) {
      cream();
      const count = typedCount(T.typeB, t);
      const selecting = span(t, T.select.from, T.select.to);
      typed(ctx!, "rate my setup", count, typedB(t), selecting > 0 ? 0 : caretAt(t, T.caretB), selecting, span(t, T.bold.from, T.bold.to));
    } else if (t < T.away.from) {
      cream();
      if (t < T.made) making(ctx!, t);
      else ctx!.drawImage(setupCanvas, 0, 0);
      typed(ctx!, "rate my setup", 13, typedB(t), 0, 1, 1);
    } else if (t < T.back.to) {
      const away = glide(span(t, T.away.from, T.away.to));
      const back = glide(span(t, T.back.from, T.back.to));
      feed(ctx!, Math.exp(Math.log(ZOOM) * (1 - away + back)));
    } else if (t < T.clearB.to) {
      cream();
      ctx!.globalAlpha = 1 - sine(span(t, T.clearB.from, T.clearB.to));
      ctx!.drawImage(setupCanvas, 0, 0);
      ctx!.globalAlpha = 1;
      typed(ctx!, "day one", 0, 1, caretAt(t, T.caretA));
    } else if (t < T.pipe) {
      cream();
      typed(ctx!, "day one", typedCount(T.typeA, t), 1 - sine(span(t, T.fadeA.from, T.fadeA.to)), caretAt(t, T.caretA));
    } else if (t < plan.done) {
      cream();
      drawDayOne(ctx!, pipedScene(t));
      typed(ctx!, "day one", 7, 1 - sine(span(t, T.fadeA.from, T.fadeA.to)), 0);
    } else {
      cream();
      ctx!.drawImage(posterCanvas, 0, 0);
    }
    ctx!.restore();
  }

  return { draw, duration };
}

declare global {
  interface Window {
    STAGE?: { ready: Promise<void>; duration: number; fps: number; beats: typeof T; seek: (t: number) => Promise<void> };
  }
}

export default function Stage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const main = ref.current;
    if (!main || window.STAGE) return;
    let built: Built | null = null;
    const stage = {
      ready: Promise.resolve(),
      duration: 0,
      fps: FPS,
      beats: T,
      seek: async (t: number) => {
        if (!built) throw new Error("not ready");
        const d = built.duration;
        built.draw(((t % d) + d) % d);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      },
    };
    stage.ready = build(main).then((b) => {
      built = b;
      stage.duration = b.duration;
    });
    window.STAGE = stage;
  }, []);
  return <canvas ref={ref} id="stage" width={W} height={H} style={{ position: "fixed", left: 0, top: 0, width: W, height: H, display: "block" }} />;
}
