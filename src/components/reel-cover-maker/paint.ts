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
import { isStill, reachOf, surfaceAt, type Surface } from "@/components/reel-cover-maker/ripple";
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
  written?: (op: Extract<Op, { kind: "text" | "ink" }>, at: number, pixelScale: number) => { image: CanvasImageSource; x: number; y: number; w: number; h: number } | null;
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

/** Whether any text in `ops` cuts a gap round itself. */
function cuts(ops: Op[]): boolean {
  return ops.some((op) => (op.kind === "text" ? !!(op.knock || op.knockShape) : op.kind === "ripple" && op.cut?.length ? true : "ops" in op && cuts(op.ops)));
}

/** A text's letters drawn by `how` where it is, squeezed across from its start if it is. */
function lettered(ctx: PaintTarget, op: Extract<Op, { kind: "text" }>, how: (x: number, y: number) => void, fallbackScale = 1) {
  // A broad pen's weight: the letters drawn again and again a little further right, a canvas pixel apart at most, so a downstroke thickens and a hairline along the pen's way does not.
  const nib = op.nib ?? 0;
  const steps = nib > 0 ? Math.min(64, Math.max(2, Math.ceil(nib * pixelsPerUnit(ctx, fallbackScale)))) : 0;
  const each = (x: number, y: number) => {
    how(x, y);
    for (let i = 1; i <= steps; i += 1) how(x + (nib * i) / steps, y);
  };
  if (!op.sx || op.sx === 1) {
    each(op.x, op.y);
    return;
  }
  ctx.save();
  ctx.translate(op.x, op.y);
  ctx.scale(op.sx, 1);
  each(0, 0);
  ctx.restore();
}

/** One canvas reused for every knockout layer, grown to the largest asked for and never shrunk, so it is not made again for each canvas painted. */
let knockCanvas: HTMLCanvasElement | null = null;

/**
 * A clear layer the size of the canvas `ctx` draws on, under the same
 * transform and text settings, to draw a knockout group in; null where
 * there is no page to make one (the tests' stand-in).
 */
function knockoutLayer(ctx: PaintTarget): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const target = (ctx as Partial<CanvasRenderingContext2D>).canvas as { width: number; height: number } | undefined;
  const m = (ctx as Partial<Pick<CanvasRenderingContext2D, "getTransform">>).getTransform?.();
  if (typeof document === "undefined" || !target || !m) return null;
  const w = Math.max(1, target.width);
  const h = Math.max(1, target.height);
  knockCanvas ??= document.createElement("canvas");
  if (knockCanvas.width < w) knockCanvas.width = w;
  if (knockCanvas.height < h) knockCanvas.height = h;
  const layer = knockCanvas.getContext("2d");
  if (!layer) return null;
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.globalAlpha = 1;
  layer.globalCompositeOperation = "source-over";
  layer.clearRect(0, 0, w, h);
  layer.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  layer.textAlign = "left";
  layer.textBaseline = "alphabetic";
  return { ctx: layer, w, h };
}

/**
 * A gap cut round a word written part way (writer.ts's picture of it): the
 * picture taken out of the layer at a ring of places `r` round its own, and
 * at its own, so the gap follows the pen.
 */
function cutAround(ctx: PaintTarget, made: { image: CanvasImageSource; x: number; y: number; w: number; h: number }, r: number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const around = 12;
  for (let i = 0; i < around; i += 1) {
    const a = (i / around) * Math.PI * 2;
    ctx.drawImage(made.image, made.x + Math.cos(a) * r, made.y + Math.sin(a) * r, made.w, made.h);
  }
  ctx.drawImage(made.image, made.x, made.y, made.w, made.h);
  ctx.restore();
}

function outline(ctx: PaintTarget, polygons: number[][]) {
  ctx.beginPath();
  for (const polygon of polygons) {
    ctx.moveTo(polygon[0], polygon[1]);
    for (let i = 2; i < polygon.length; i += 2) ctx.lineTo(polygon[i], polygon[i + 1]);
    ctx.closePath();
  }
}

function draw(ctx: PaintTarget, scene: Scene, op: Op, options: PaintOptions, haze?: Haze, inLayer = false) {
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
    case "ink": {
      // Printed letters: their outline filled, holes and all, by the nonzero rule.
      const fill = () => {
        outline(ctx, op.polygons);
        ctx.fillStyle = haze?.tint ? "#000" : op.color;
        ctx.fill();
      };
      if (haze) hazed(ctx, haze, op.color, fill);
      else fill();
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
      // In a knockout layer, the gap first, taken out of what the layer holds: a shape of its own, or the text's, wider all round.
      if (inLayer && (op.knock || op.knockShape) && !haze) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "#000";
        ctx.fillStyle = "#000";
        if (op.knockShape) {
          outline(ctx, op.knockShape);
          ctx.fill();
        } else {
          ctx.lineWidth = (op.knock ?? 0) * 2 + (op.bold ?? 0);
          ctx.lineJoin = "round";
          lettered(ctx, op, (x, y) => {
            ctx.strokeText(op.text, x, y);
            ctx.fillText(op.text, x, y);
          }, options.scale);
        }
        ctx.restore();
      }
      const set = () =>
        lettered(ctx, op, (x, y) => {
          if (op.outline) {
            ctx.strokeStyle = colour;
            ctx.lineWidth = op.outline;
            ctx.lineJoin = "round";
            ctx.strokeText(op.text, x, y);
            return;
          }
          ctx.fillStyle = colour;
          ctx.fillText(op.text, x, y);
          if (op.bold) {
            ctx.strokeStyle = colour;
            ctx.lineWidth = op.bold;
            ctx.lineJoin = "round";
            ctx.strokeText(op.text, x, y);
          }
        }, options.scale);
      if (haze) hazed(ctx, haze, op.color, set);
      else set();
      ctx.restore();
      return;
    }
    case "knockout": {
      // Drawn as a layer of its own only where it has a gap to cut, and only once: a layer in a layer is drawn plainly.
      const into = !inLayer && !haze && cuts(op.ops) ? knockoutLayer(ctx) : null;
      if (!into) {
        for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
        return;
      }
      for (const inner of op.ops) draw(into.ctx, scene, inner, options, undefined, true);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(into.ctx.canvas, 0, 0, into.w, into.h, 0, 0, into.w, into.h);
      ctx.restore();
      return;
    }
    case "turn":
      ctx.save();
      ctx.translate(op.cx, op.cy);
      ctx.rotate(op.angle);
      ctx.translate(-op.cx, -op.cy);
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
      ctx.restore();
      return;
    case "matrix":
      ctx.save();
      ctx.transform(...op.m);
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
      ctx.restore();
      return;
    case "fade":
      if (op.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, op.alpha);
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
      ctx.restore();
      return;
    case "blur": {
      // A shadow's blur is twice the spread asked for, in canvas pixels; two in a row add as spreads do.
      const blur = Math.max(0, op.radius) * 2 * pixelsPerUnit(ctx, options.scale);
      const within: Haze = { blur: haze ? Math.hypot(haze.blur, blur) : blur, tint: op.tint ?? haze?.tint };
      for (const inner of op.ops) draw(ctx, scene, inner, options, within, inLayer);
      return;
    }
    case "clip":
      ctx.save();
      outline(ctx, op.polygons);
      ctx.clip();
      for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
      ctx.restore();
      return;
    case "ripple":
      rippled(ctx, scene, op, options, haze, inLayer);
      return;
    case "write": {
      const only = op.ops.length === 1 ? op.ops[0] : null;
      const word = only && (only.kind === "text" || only.kind === "ink") ? only : null;
      const made = word && op.at > 0 && op.at < 1 ? options.written?.(word, op.at, pixelsPerUnit(ctx, options.scale)) : null;
      if (word && made) {
        if (inLayer && word.kind === "text" && word.knock && !haze) cutAround(ctx, made, word.knock + (word.bold ?? 0) / 2);
        ctx.save();
        ctx.globalAlpha *= word.kind === "text" ? (word.alpha ?? 1) : 1;
        const lay = () => ctx.drawImage(made.image, made.x, made.y, made.w, made.h);
        if (haze) hazed(ctx, haze, word.color, lay);
        else lay();
        ctx.restore();
        return;
      }
      wipe(ctx, scene, op, options, haze, inLayer);
    }
  }
}

/** The canvas a rippled layer is handed back to the page from, grown to the largest area asked for and never shrunk. */
let rippleOut: HTMLCanvasElement | null = null;

function rippleOutput(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  rippleOut ??= document.createElement("canvas");
  if (rippleOut.width < w) rippleOut.width = w;
  if (rippleOut.height < h) rippleOut.height = h;
  return rippleOut.getContext("2d");
}

/**
 * A fresh canvas for a rippled layer to be drawn in and read back. Fresh,
 * and not marked as read often, so the browser letters it as it letters
 * the page's own canvas: one kept and read every frame is moved off the
 * graphics card, where text's edges come out a little different, and the
 * cover then stepped at the moment the water stilled.
 */
function rippleLayer(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext("2d");
}

/** Whether any of `ops` is paste, whose layer is placed in the canvas's own pixels and so cannot be drawn into a layer of an area. */
function holdsPaste(ops: Op[]): boolean {
  return ops.some((op) => op.kind === "liquid" || ("ops" in op && holdsPaste(op.ops)));
}

/** How far apart the surface is worked out, in canvas pixels: water is smooth at this scale, and every pixel between is read from the four round it. */
const RIPPLE_STEP = 2;

/** The surface worked out on the canvas's grid, in blocks of this many points a side, only where a frame asks for it. */
const FIELD_BLOCK = 32;

/** Each surface's grid on the canvas it was last drawn on: a frame's letters, each under the same water, share it. */
const fields = new WeakMap<Surface, { key: string; blocks: Map<number, Float32Array> }>();

/**
 * The surface at a point of the canvas's grid (every `RIPPLE_STEP` canvas
 * pixels): how far the eye is sent there, in canvas pixels, and the light
 * added, each point worked out the first time it is asked for.
 */
function fieldOf(surface: Surface, k: number, o: { x: number; y: number }) {
  const key = `${k}|${o.x},${o.y}`;
  let made = fields.get(surface);
  if (!made || made.key !== key) {
    made = { key, blocks: new Map() };
    fields.set(surface, made);
  }
  const { blocks } = made;
  const out: [number, number, number] = [0, 0, 0];
  return (gx: number, gy: number): [number, number, number] => {
    const bx = Math.floor(gx / FIELD_BLOCK);
    const by = Math.floor(gy / FIELD_BLOCK);
    const id = by * 65536 + bx;
    let block = blocks.get(id);
    if (!block) {
      // Four numbers a point: how far across and down, the light, and whether it is worked out yet.
      block = new Float32Array(FIELD_BLOCK * FIELD_BLOCK * 4);
      blocks.set(id, block);
    }
    const i = ((gy - by * FIELD_BLOCK) * FIELD_BLOCK + (gx - bx * FIELD_BLOCK)) * 4;
    if (!block[i + 3]) {
      const s = surfaceAt(surface, (gx * RIPPLE_STEP + 0.5) / k + o.x, (gy * RIPPLE_STEP + 0.5) / k + o.y);
      block[i] = s.dx * k;
      block[i + 1] = s.dy * k;
      block[i + 2] = s.light;
      block[i + 3] = 1;
    }
    out[0] = block[i];
    out[1] = block[i + 1];
    out[2] = block[i + 2];
    return out;
  };
}

/**
 * Ops seen through water: drawn as a layer of the area alone, under the
 * same transform, then every pixel shown from where the surface sends the
 * eye (read between pixels by their alpha, so an edge never darkens), with
 * the light it adds, and a flat colour's edge drawn back to a pixel's width
 * as far as it is moved. In a knockout layer the cut is rippled the same
 * and taken out of what is under it first. Where it moves nothing, or there
 * is no page to make a layer in, the ops are drawn as they are.
 */
function rippled(ctx: PaintTarget, scene: Scene, op: Extract<Op, { kind: "ripple" }>, options: PaintOptions, haze?: Haze, inLayer = false) {
  const target = (ctx as Partial<CanvasRenderingContext2D>).canvas as { width: number; height: number } | undefined;
  const m = (ctx as Partial<Pick<CanvasRenderingContext2D, "getTransform">>).getTransform?.();
  const { surface } = op;
  const plainly = () => {
    if (op.cut && inLayer && !haze) {
      for (const inner of op.cut) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        draw(ctx, scene, inner, options, undefined, false);
        ctx.restore();
      }
    }
    for (const inner of op.ops) draw(ctx, scene, inner, options, haze, false);
  };
  if (haze || !target || !m || isStill(surface) || holdsPaste(op.ops) || typeof document === "undefined") {
    plainly();
    return;
  }
  const k = options.scale;
  const o = options.origin ?? { x: 0, y: 0 };
  const reach = reachOf(surface) * k + 2;
  const x0 = Math.max(0, Math.floor((op.area.x - o.x) * k - reach));
  const y0 = Math.max(0, Math.floor((op.area.y - o.y) * k - reach));
  const x1 = Math.min(target.width, Math.ceil((op.area.x + op.area.w - o.x) * k + reach));
  const y1 = Math.min(target.height, Math.ceil((op.area.y + op.area.h - o.y) * k + reach));
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return;
  // The surface on a coarse grid over the area, once for the cut and the letters alike, and for every letter under the same water this frame (`fieldOf`).
  const field = fieldOf(surface, k, o);
  const gw = Math.ceil(rw / RIPPLE_STEP) + 2;
  const gh = Math.ceil(rh / RIPPLE_STEP) + 2;
  const grid = new Float32Array(gw * gh * 3);
  const gx0 = Math.floor(x0 / RIPPLE_STEP);
  const gy0 = Math.floor(y0 / RIPPLE_STEP);
  const fx0 = x0 / RIPPLE_STEP - gx0;
  const fy0 = y0 / RIPPLE_STEP - gy0;
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      // Read off the shared grid, which lies on the canvas's own multiples of the step.
      const at = field(gx0 + gx, gy0 + gy);
      const g = (gy * gw + gx) * 3;
      grid[g] = at[0];
      grid[g + 1] = at[1];
      grid[g + 2] = at[2];
    }
  }
  const pass = (ops: Op[], mode: GlobalCompositeOperation, lit: boolean): boolean => {
    const layer = rippleLayer(rw, rh);
    const out = rippleOutput(rw, rh);
    if (!layer || !out) return false;
    layer.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    layer.textAlign = "left";
    layer.textBaseline = "alphabetic";
    for (const inner of ops) draw(layer, scene, inner, options, undefined, false);
    const src = layer.getImageData(0, 0, rw, rh).data;
    const img = out.createImageData(rw, rh);
    const dst = img.data;
    // Only where there is something to see, or near enough to be moved there.
    let bx0 = rw;
    let by0 = rh;
    let bx1 = -1;
    let by1 = -1;
    for (let y = 0; y < rh; y += 1) {
      const row = y * rw * 4 + 3;
      for (let x = 0; x < rw; x += 1) {
        if (src[row + x * 4] === 0) continue;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        by1 = y;
      }
    }
    if (bx1 < 0) return true;
    const pad = Math.ceil(reach) + 1;
    const ya = Math.max(0, by0 - pad);
    const yb = Math.min(rh, by1 + pad + 1);
    const xa = Math.max(0, bx0 - pad);
    const xb = Math.min(rw, bx1 + pad + 1);
    for (let y = ya; y < yb; y += 1) {
      const gyf = y / RIPPLE_STEP + fy0;
      const gy = Math.min(gh - 2, Math.floor(gyf));
      const fy = gyf - gy;
      for (let x = xa; x < xb; x += 1) {
        const gxf = x / RIPPLE_STEP + fx0;
        const gx = Math.min(gw - 2, Math.floor(gxf));
        const fx = gxf - gx;
        const a = (gy * gw + gx) * 3;
        const b = a + 3;
        const c = a + gw * 3;
        const d = c + 3;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const mx = grid[a] * w00 + grid[b] * w10 + grid[c] * w01 + grid[d] * w11;
        const my = grid[a + 1] * w00 + grid[b + 1] * w10 + grid[c + 1] * w01 + grid[d + 1] * w11;
        const i = (y * rw + x) * 4;
        // Water too calm here to move or light anything: the pixel as it is.
        if (mx * mx + my * my < 0.0025 && (!lit || grid[a + 2] + grid[b + 2] + grid[c + 2] + grid[d + 2] < 0.002)) {
          dst[i] = src[i];
          dst[i + 1] = src[i + 1];
          dst[i + 2] = src[i + 2];
          dst[i + 3] = src[i + 3];
          continue;
        }
        const sx = x + mx;
        const sy = y + my;
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const tx = sx - ix;
        const ty = sy - iy;
        let r = 0;
        let g = 0;
        let bl = 0;
        let al = 0;
        for (let j = 0; j < 4; j += 1) {
          const qx = ix + (j & 1);
          const qy = iy + (j >> 1);
          if (qx < 0 || qy < 0 || qx >= rw || qy >= rh) continue;
          const q = (qy * rw + qx) * 4;
          const aw = src[q + 3] * (j & 1 ? tx : 1 - tx) * (j >> 1 ? ty : 1 - ty);
          if (aw <= 0) continue;
          r += src[q] * aw;
          g += src[q + 1] * aw;
          bl += src[q + 2] * aw;
          al += aw;
        }
        if (al <= 0.01) continue;
        r /= al;
        g /= al;
        bl /= al;
        if (lit) {
          const light = Math.min(1, grid[a + 2] * w00 + grid[b + 2] * w10 + grid[c + 2] * w01 + grid[d + 2] * w11);
          if (light > 0) {
            r += (255 - r) * light;
            g += (255 - g) * light;
            bl += (255 - bl) * light;
          }
        }
        let alpha = Math.min(255, al);
        // A flat colour's edge, softened by reading between pixels, drawn back to a pixel's width, as far as this pixel is moved: still, it is the cover's own edge.
        if (surface.crisp) alpha = Math.min(255, Math.max(0, (alpha - 127.5) * (1 + 0.7 * Math.min(1, Math.sqrt(mx * mx + my * my))) + 127.5));
        dst[i] = r;
        dst[i + 1] = g;
        dst[i + 2] = bl;
        dst[i + 3] = alpha;
      }
    }
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = mode;
    ctx.drawImage(out.canvas, 0, 0, rw, rh, x0, y0, rw, rh);
    ctx.restore();
    return true;
  };
  if (op.cut?.length && inLayer && !pass(op.cut, "destination-out", false)) {
    plainly();
    return;
  }
  if (!pass(op.ops, "source-over", true)) plainly();
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
function wipe(ctx: PaintTarget, scene: Scene, op: Extract<Op, { kind: "write" }>, options: PaintOptions, haze?: Haze, inLayer = false) {
  if (op.at <= 0) return;
  if (op.at >= 1) {
    for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
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
  for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
  ctx.restore();
  const step = feather / WIPE_BANDS;
  for (let k = 0; k < WIPE_BANDS; k += 1) {
    ctx.save();
    band(solid + k * step, solid + (k + 1) * step);
    ctx.globalAlpha *= 1 - (k + 0.5) / WIPE_BANDS;
    for (const inner of op.ops) draw(ctx, scene, inner, options, haze, inLayer);
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
