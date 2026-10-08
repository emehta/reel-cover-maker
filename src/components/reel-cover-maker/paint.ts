/**
 * Drawing a scene on a canvas.
 *
 * The scene is in pixels of the picture Instagram is given; `scale` maps
 * them to the canvas, so the same scene fills a 1080-wide download and a
 * thumbnail a tenth of that. A liquid layer is the exception: it is made
 * pixel by pixel for the canvas it is going on, and handed in lit; and the
 * owner's photo is handed in too, with the window of it to show.
 */

import type { FaceId } from "@/components/reel-cover-maker/faces";
import type { LiquidOp, Op, Scene } from "@/components/reel-cover-maker/scene";

/** The part of a 2D context painting uses, so a test can stand in for one. */
export type PaintTarget = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "setTransform"
  | "translate"
  | "rotate"
  | "scale"
  | "transform"
  | "globalCompositeOperation"
  | "fillRect"
  | "fillText"
  | "strokeText"
  | "beginPath"
  | "fill"
  | "createRadialGradient"
  | "createPattern"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "globalAlpha"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "moveTo"
  | "lineTo"
  | "arcTo"
  | "closePath"
  | "stroke"
  | "drawImage"
  | "clip"
>;

export interface PaintOptions {
  /** Canvas pixels for each pixel of the picture. */
  scale: number;
  /** The point of the picture at the canvas's top left, to draw a window of it: the grid's, for a thumbnail. */
  origin?: { x: number; y: number };
  /** The CSS font for a face at a size. */
  font: (face: FaceId, size: number) => string;
  /** A tile of grain at the picture's own scale, or null to leave grain out. */
  grain: CanvasImageSource | null;
  /**
   * A liquid layer lit for this canvas: the part of `image` to copy, and
   * where to, in this canvas's pixels, and as how big if not as it is (a
   * draft, made smaller); null while it is being made. The paste, or the
   * shadow it casts with no ground of its own, to be multiplied onto what
   * is under it.
   */
  liquid?: (op: LiquidOp, part: "paste" | "shadow") => { image: CanvasImageSource; sx: number; sy: number; w: number; h: number; x: number; y: number; dw?: number; dh?: number } | null;
  /** The photo behind the letters and the window of it that covers the picture, in its own pixels; mirrored if `flip`. */
  photo?: { image: CanvasImageSource; sx: number; sy: number; sw: number; sh: number; flip: boolean } | null;
  /**
   * A word written on part way, traced as a pen would write it (writer.ts),
   * drawn for `pixelScale` canvas pixels to the picture's: a picture and
   * where it goes in the word's own frame. Absent or null, the word is
   * wiped on instead.
   */
  written?: (op: Extract<Op, { kind: "text" }>, at: number, pixelScale: number) => { image: CanvasImageSource; x: number; y: number; w: number; h: number } | null;
}

function roundedRect(ctx: PaintTarget, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Out of focus: how soft, in canvas pixels (a blur's spread, as a shadow's
 * blur is measured), and the one colour everything is drawn in, for a
 * shadow cast.
 */
interface Haze {
  blur: number;
  tint?: string;
}

/** How far off the canvas a thing drawn out of focus is put, in canvas pixels, so only its shadow is seen. */
const AWAY = 32768;

type Shadowing = PaintTarget & Partial<Pick<CanvasRenderingContext2D, "getTransform" | "shadowColor" | "shadowBlur" | "shadowOffsetX" | "shadowOffsetY" | "imageSmoothingQuality">>;

/** A colour as the canvas reads it, made `alpha` as solid as it was. */
function fainter(c: Shadowing, colour: string, alpha: number): string {
  c.shadowColor = colour;
  const read = String(c.shadowColor);
  const hex = /^#([0-9a-f]{6})$/i.exec(read);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const parts = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(read);
  if (parts) return `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${(parts[4] === undefined ? 1 : Number(parts[4])) * alpha})`;
  return read;
}

/**
 * Something drawn out of focus, in every engine: drawn far off the canvas
 * with a shadow cast back where it belongs, soft and in its own colour (or
 * the haze's tint). Safari's canvas has no blur filter, but every canvas
 * casts shadows. Safari casts a shadow as solid however see-through the
 * drawing is, so how see-through is put in the shadow's colour, and the
 * drawing made solid. Where the target cannot cast shadows, it is drawn as
 * it is.
 */
function hazed(ctx: PaintTarget, haze: Haze, colour: string, paintIt: () => void) {
  const c = ctx as Shadowing;
  const m = c.getTransform?.();
  if (!m || !("shadowBlur" in c)) {
    if (!haze.tint) paintIt();
    return;
  }
  ctx.save();
  c.shadowColor = fainter(c, haze.tint ?? colour, ctx.globalAlpha);
  ctx.globalAlpha = 1;
  c.shadowBlur = haze.blur;
  c.shadowOffsetX = -AWAY;
  c.shadowOffsetY = 0;
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e + AWAY, m.f);
  paintIt();
  ctx.restore();
}

/** One canvas reused to soften paste with: drawn from as soon as it is drawn on. */
let softener: HTMLCanvasElement | null = null;

/**
 * A layer of paste drawn out of focus, by drawing it small and back up to
 * size: a shadow would cast it in one colour. Where there is no page to
 * make a canvas in, it is drawn sharp.
 */
function softLayer(ctx: PaintTarget, layer: { image: CanvasImageSource; sx: number; sy: number; w: number; h: number; x: number; y: number; dw?: number; dh?: number }, blur: number): boolean {
  if (typeof document === "undefined" || blur < 0.75) return false;
  const dw = layer.dw ?? layer.w;
  const dh = layer.dh ?? layer.h;
  const shrink = Math.min(24, Math.max(1.5, blur / 2));
  const pad = Math.ceil(blur * 2);
  const w = Math.max(1, Math.ceil((dw + pad * 2) / shrink));
  const h = Math.max(1, Math.ceil((dh + pad * 2) / shrink));
  softener ??= document.createElement("canvas");
  if (softener.width < w) softener.width = w;
  if (softener.height < h) softener.height = h;
  const small = softener.getContext("2d");
  if (!small) return false;
  small.clearRect(0, 0, w, h);
  small.imageSmoothingQuality = "high";
  small.drawImage(layer.image, layer.sx, layer.sy, layer.w, layer.h, pad / shrink, pad / shrink, dw / shrink, dh / shrink);
  (ctx as Shadowing).imageSmoothingQuality = "high";
  ctx.drawImage(softener, 0, 0, w, h, layer.x - pad, layer.y - pad, w * shrink, h * shrink);
  return true;
}

function outline(ctx: PaintTarget, polygons: number[][]) {
  ctx.beginPath();
  for (const polygon of polygons) {
    ctx.moveTo(polygon[0], polygon[1]);
    for (let i = 2; i < polygon.length; i += 2) ctx.lineTo(polygon[i], polygon[i + 1]);
    ctx.closePath();
  }
}

function draw(ctx: PaintTarget, scene: Scene, op: Op, options: PaintOptions, haze?: Haze) {
  switch (op.kind) {
    case "fill":
      ctx.fillStyle = op.color;
      ctx.fillRect(0, 0, scene.width, scene.height);
      return;
    case "shape": {
      if (haze) {
        hazed(ctx, haze, op.color, () => {
          outline(ctx, op.polygons);
          ctx.fillStyle = haze.tint ? "#000" : op.color;
          ctx.fill();
        });
        if (op.strokeWidth > 0 && !haze.tint) {
          hazed(ctx, haze, op.stroke, () => {
            outline(ctx, op.polygons);
            ctx.strokeStyle = op.stroke;
            ctx.lineWidth = op.strokeWidth;
            ctx.lineJoin = "miter";
            ctx.stroke();
          });
        }
        return;
      }
      outline(ctx, op.polygons);
      ctx.fillStyle = op.color;
      ctx.fill();
      if (op.strokeWidth > 0) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.strokeWidth;
        ctx.lineJoin = "miter";
        ctx.stroke();
      }
      return;
    }
    case "liquid": {
      // A shadow cast is of the stickers' shape: paste lies on them.
      if (haze?.tint) return;
      // Drawn by the worker into canvas pixels; placed without the scene's scale.
      // Each layer is drawn as soon as it is handed over: on the GPU the next is lit in the same canvas.
      const place = (part: "paste" | "shadow", blend: GlobalCompositeOperation) => {
        const layer = options.liquid?.(op, part);
        if (!layer) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = blend;
        if (!haze || !softLayer(ctx, layer, haze.blur)) ctx.drawImage(layer.image, layer.sx, layer.sy, layer.w, layer.h, layer.x, layer.y, layer.dw ?? layer.w, layer.dh ?? layer.h);
        ctx.restore();
      };
      // A shadow over a photo darkens it; over nothing, it is a clear stain, laid as it is.
      if (op.shadow) place("shadow", op.under ? "source-over" : "multiply");
      place("paste", "source-over");
      return;
    }
    case "photo": {
      const photo = options.photo;
      if (!photo) return;
      ctx.save();
      if (photo.flip) {
        ctx.translate(scene.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(photo.image, photo.sx, photo.sy, photo.sw, photo.sh, 0, 0, scene.width, scene.height);
      ctx.restore();
      return;
    }
    case "grain": {
      if (!options.grain) return;
      const pattern = ctx.createPattern(options.grain, "repeat");
      if (!pattern) return;
      ctx.save();
      ctx.globalAlpha = op.alpha;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, scene.width, scene.height);
      ctx.restore();
      return;
    }
    case "box": {
      const fill = () => {
        ctx.fillStyle = haze?.tint ? "#000" : op.color;
        roundedRect(ctx, op.x, op.y, op.w, op.h, op.radius);
        ctx.fill();
      };
      if (haze) hazed(ctx, haze, op.color, fill);
      else fill();
      return;
    }
    case "text": {
      ctx.save();
      ctx.font = options.font(op.face, op.size);
      // Its own alpha within whatever fade it is in.
      ctx.globalAlpha *= op.alpha ?? 1;
      const colour = haze?.tint ? "#000" : op.color;
      const set = () => {
        if (op.outline) {
          ctx.strokeStyle = colour;
          ctx.lineWidth = op.outline;
          ctx.lineJoin = "round";
          ctx.strokeText(op.text, op.x, op.y);
        } else {
          ctx.fillStyle = colour;
          ctx.fillText(op.text, op.x, op.y);
        }
      };
      if (haze) hazed(ctx, haze, op.color, set);
      else set();
      ctx.restore();
      return;
    }
    case "turn":
      ctx.save();
      ctx.translate(op.cx, op.cy);
      ctx.rotate(op.angle);
      ctx.translate(-op.cx, -op.cy);
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze);
      ctx.restore();
      return;
    case "matrix":
      ctx.save();
      ctx.transform(...op.m);
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze);
      ctx.restore();
      return;
    case "fade":
      if (op.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, op.alpha);
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze);
      ctx.restore();
      return;
    case "blur": {
      // A shadow's blur is twice the spread asked for, in canvas pixels; two in a row add as spreads do.
      const blur = Math.max(0, op.radius) * 2 * pixelsPerUnit(ctx, options.scale);
      const within: Haze = { blur: haze ? Math.hypot(haze.blur, blur) : blur, tint: op.tint ?? haze?.tint };
      for (const inner of op.ops) draw(ctx, scene, inner, options, within);
      return;
    }
    case "write": {
      const word = op.ops.length === 1 && op.ops[0].kind === "text" ? op.ops[0] : null;
      const made = word && op.at > 0 && op.at < 1 ? options.written?.(word, op.at, pixelsPerUnit(ctx, options.scale)) : null;
      if (word && made) {
        ctx.save();
        ctx.globalAlpha *= word.alpha ?? 1;
        const lay = () => ctx.drawImage(made.image, made.x, made.y, made.w, made.h);
        if (haze) hazed(ctx, haze, word.color, lay);
        else lay();
        ctx.restore();
        return;
      }
      wipe(ctx, scene, op, options, haze);
    }
  }
}

/** How many canvas pixels the context draws for one of the picture's here, every turn and scale it is under taken in. */
function pixelsPerUnit(ctx: PaintTarget, fallback: number): number {
  const m = (ctx as Partial<Pick<CanvasRenderingContext2D, "getTransform">>).getTransform?.();
  return m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : fallback;
}

/** How far a wipe's edge leans, across for each pixel down: handwriting's slant, about 15 degrees. */
export const WIPE_LEAN = 0.27;

/** How many bands the wipe's soft edge is drawn in, each a little fainter. */
const WIPE_BANDS = 8;

/**
 * A word wiped on where it cannot be traced: the ops shown left of a
 * leaning edge, solid behind a soft band that runs from solid to clear. Drawn in clipped bands that never overlap,
 * each once at its own alpha, so the edge is exact and needs no second
 * canvas.
 */
function wipe(ctx: PaintTarget, scene: Scene, op: Extract<Op, { kind: "write" }>, options: PaintOptions, haze?: Haze) {
  if (op.at <= 0) return;
  if (op.at >= 1) {
    for (const inner of op.ops) draw(ctx, scene, inner, options, haze);
    return;
  }
  const feather = Math.max(1, op.h * 0.45);
  const mid = op.y + op.h / 2;
  const top = op.y - op.h;
  const bottom = op.y + op.h * 2;
  // The edge's position, where it crosses the box's middle: from wholly left of the box to wholly past it, soft band and lean included.
  const reach = (op.h * 1.5) * WIPE_LEAN;
  const edge = op.x - reach + op.at * (op.w + reach * 2 + feather);
  const far = op.w + op.h * 4;
  /** The part of the picture left of an edge through (at, mid) and right of one through (from, mid). */
  const band = (from: number, at: number) => {
    const xAt = (x: number, y: number) => x - (y - mid) * WIPE_LEAN;
    ctx.beginPath();
    ctx.moveTo(xAt(from, top), top);
    ctx.lineTo(xAt(at, top), top);
    ctx.lineTo(xAt(at, bottom), bottom);
    ctx.lineTo(xAt(from, bottom), bottom);
    ctx.closePath();
    ctx.clip();
  };
  const solid = edge - feather;
  ctx.save();
  band(op.x - far, solid);
  for (const inner of op.ops) draw(ctx, scene, inner, options, haze);
  ctx.restore();
  const step = feather / WIPE_BANDS;
  for (let k = 0; k < WIPE_BANDS; k += 1) {
    ctx.save();
    band(solid + k * step, solid + (k + 1) * step);
    ctx.globalAlpha *= 1 - (k + 0.5) / WIPE_BANDS;
    for (const inner of op.ops) draw(ctx, scene, inner, options, haze);
    ctx.restore();
  }
}

/** Draw `scene` on `ctx`, `scale` canvas pixels to each of the picture's, from `origin`. */
export function paint(ctx: PaintTarget, scene: Scene, options: PaintOptions): void {
  ctx.save();
  const { scale, origin = { x: 0, y: 0 } } = options;
  ctx.setTransform(scale, 0, 0, scale, -origin.x * scale, -origin.y * scale);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const op of scene.ops) draw(ctx, scene, op, options);
  ctx.restore();
}
