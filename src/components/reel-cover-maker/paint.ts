/**
 * Drawing a scene on a canvas.
 *
 * The scene is in pixels of the picture Instagram is given; `scale` maps
 * them to the canvas, so the same scene fills a 1080-wide download and a
 * thumbnail a tenth of that. A liquid layer is the exception: it is made
 * pixel by pixel for the canvas it is going on, and handed in lit.
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
  /** A liquid layer lit for this canvas: the part of `image` to copy, and where to, in this canvas's pixels; null while it is being made. */
  liquid?: (op: LiquidOp) => { image: CanvasImageSource; sx: number; sy: number; w: number; h: number; x: number; y: number } | null;
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

function draw(ctx: PaintTarget, scene: Scene, op: Op, options: PaintOptions) {
  switch (op.kind) {
    case "fill":
      ctx.fillStyle = op.color;
      ctx.fillRect(0, 0, scene.width, scene.height);
      return;
    case "shape": {
      ctx.beginPath();
      for (const polygon of op.polygons) {
        ctx.moveTo(polygon[0], polygon[1]);
        for (let i = 2; i < polygon.length; i += 2) ctx.lineTo(polygon[i], polygon[i + 1]);
        ctx.closePath();
      }
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
      // Drawn by the worker into canvas pixels; placed without the scene's scale.
      const layer = options.liquid?.(op);
      if (!layer) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer.image, layer.sx, layer.sy, layer.w, layer.h, layer.x, layer.y, layer.w, layer.h);
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
    case "box":
      ctx.fillStyle = op.color;
      roundedRect(ctx, op.x, op.y, op.w, op.h, op.radius);
      ctx.fill();
      return;
    case "text":
      ctx.save();
      ctx.font = options.font(op.face, op.size);
      ctx.globalAlpha = op.alpha ?? 1;
      if (op.outline) {
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.outline;
        ctx.lineJoin = "round";
        ctx.strokeText(op.text, op.x, op.y);
      } else {
        ctx.fillStyle = op.color;
        ctx.fillText(op.text, op.x, op.y);
      }
      ctx.restore();
      return;
    case "turn":
      ctx.save();
      ctx.translate(op.cx, op.cy);
      ctx.rotate(op.angle);
      ctx.translate(-op.cx, -op.cy);
      for (const inner of op.ops) draw(ctx, scene, inner, options);
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
