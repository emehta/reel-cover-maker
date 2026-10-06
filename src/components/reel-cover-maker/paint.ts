/**
 * Drawing a scene on a canvas.
 *
 * The scene is in pixels of the picture Instagram is given; `scale` maps
 * them to the canvas, so the same scene fills a 1080-wide download and a
 * thumbnail a tenth of that.
 */

import type { FaceId } from "@/components/reel-cover-maker/faces";
import { withAlpha } from "@/components/reel-cover-maker/palettes";
import type { Op, Scene } from "@/components/reel-cover-maker/scene";

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
}

/**
 * How a light falls away from its centre to its radius, as offset and share
 * of its strength: softly, never a disc with an edge. Exported so a test can
 * work out the ground under the text.
 */
export const LIGHT_FALLOFF: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.35, 0.55],
  [0.7, 0.16],
  [1, 0],
];

/** A light's strength at `distance` from its centre, as a share of `alpha`. */
export function lightAlpha(alpha: number, radius: number, distance: number): number {
  const t = distance / radius;
  if (t >= 1) return 0;
  for (let i = 1; i < LIGHT_FALLOFF.length; i += 1) {
    const [o1, s1] = LIGHT_FALLOFF[i];
    const [o0, s0] = LIGHT_FALLOFF[i - 1];
    if (t <= o1) return alpha * (s0 + ((t - o0) / (o1 - o0)) * (s1 - s0));
  }
  return 0;
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
    case "light": {
      const gradient = ctx.createRadialGradient(op.x, op.y, 0, op.x, op.y, op.r);
      for (const [offset, share] of LIGHT_FALLOFF) gradient.addColorStop(offset, withAlpha(op.color, op.alpha * share));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, scene.width, scene.height);
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
