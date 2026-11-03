/**
 * Water the letters are seen through, for Renaissance's Drop and Ribbon
 * (the owner's picks of 3 Nov, from a lab of ripples for every style).
 *
 * A drop sends out a packet of rings. The packet runs out at its own speed,
 * widens as it goes (its short and long waves part), and its crests run
 * through it at a speed of their own, so a crest is born at the front and
 * slides back through the packet as real ripples do. It weakens with
 * distance, as a ring's energy spreads round a longer ring, and with time.
 * Water is never perfectly even, so each ring wavers a little round its
 * course.
 *
 * A bend is a wave run along a word's baseline, as along a ribbon flicked
 * at one end: it lifts and lowers the word's strokes in turn, across the
 * line, and dies as it runs.
 *
 * What is seen through the surface is moved by it (paint.ts reads each
 * pixel from where the surface sends the eye), so a crest passing over a
 * letter bends it and lets it go. A drop's slope also lights it a little,
 * only ever adding light: a fine highlight where a crest faces the light,
 * and where its curve gathers light, so pale or dark letters alike never
 * look dirtied.
 *
 * Pure: a function of the drops, the bends and the point, so a frame is the
 * same frame every time.
 */

import type { Matrix } from "@/components/reel-cover-maker/place";

export interface Drop {
  /** Where it fell, in pixels of the picture. */
  x: number;
  y: number;
  /** Seconds since it fell: before it falls, it moves nothing. */
  age: number;
  /** How far its strongest crest moves what is seen, in pixels of the picture. */
  strength: number;
  /** How fast its packet of rings runs out, in pixels a second. */
  speed: number;
  /** From one crest to the next, in pixels. */
  wavelength: number;
  /** How wide the packet is as it is born, in wavelengths. */
  width: number;
  /** How fast the packet widens as it runs, in pixels a second. */
  spread: number;
  /** Seconds for its rings to lose most of their strength. */
  life: number;
  /** How fast its crests run, as a share of the packet's speed: under 1, each crest is born at the front and slides back. */
  phase: number;
  /** How unevenly its rings run, in pixels either way round its course. */
  wobble: number;
  seed: number;
  /** How much of it is left, 1 all of it: an animation's way of stilling the water, its light going with it. */
  fade: number;
}

/**
 * A wave run along a line (a word's baseline): `toFrame` maps a point of
 * the picture into the word's own frame, where the line runs along x;
 * `down` is that frame's y, in pixels of the picture for each of the
 * frame's, so the word is lifted across its own line however it is turned.
 */
export interface Bend {
  toFrame: Matrix;
  down: { x: number; y: number };
  /** Where its crest is along the line, in the frame's pixels. */
  front: number;
  wavelength: number;
  /** How far the packet reaches either side of its crest (a Gaussian's spread). */
  reach: number;
  /** How far it lifts at its strongest, in the frame's pixels. */
  height: number;
  /** Where the word starts and how long it is, along the line: the wave dies by about half as it runs to the far end. */
  start: number;
  length: number;
}

export interface Surface {
  drops: readonly Drop[];
  bends?: readonly Bend[];
  /** How bright a highlight a crest facing the light catches: light only ever added. */
  glint?: number;
  /** How bright the fine lines are where a crest's curve gathers light. */
  caustic?: number;
  /** What is seen is of one flat colour, so its edge is kept sharp however the surface moves it. */
  crisp?: boolean;
}

export interface SurfaceAt {
  /** Where the eye is sent from this point, in pixels of the picture: what is seen here is what is there. */
  dx: number;
  dy: number;
  /** The light added here, 0 none, 1 white. */
  light: number;
}

const TAU = Math.PI * 2;

/** The light comes from up and to the left. */
const LIGHT_X = -0.6;
const LIGHT_Y = -0.8;

/** Below this many pixels of the picture, a surface moves nothing worth drawing: it is still. */
export const STILL_BELOW = 0.02;

/** A ring's course round a drop, wavering by the drop's own seed. */
function wavered(drop: Drop, angle: number): number {
  if (!drop.wobble) return 0;
  const s = drop.seed;
  return drop.wobble * (0.55 * Math.sin(3 * angle + s * 1.7) + 0.3 * Math.sin(5 * angle + s * 4.1 + 1) + 0.15 * Math.sin(8 * angle + s * 2.3 + 2));
}

/** How strong a drop's rings are at distance `r` from it at its age, before the packet's own shape. */
export function dropStrength(drop: Drop, r: number): number {
  if (drop.age <= 0) return 0;
  const onset = Math.min(1, drop.age / 0.06);
  return (drop.strength * drop.fade * onset * Math.exp(-drop.age / drop.life)) / Math.sqrt(1 + r / (drop.wavelength * 1.5));
}

/** How far a bend lifts at a place along its line, in its frame's pixels. */
export function bendLift(bend: Bend, along: number): number {
  const u = (along - bend.front) / bend.reach;
  if (u * u > 12) return 0;
  const through = Math.min(1, Math.max(0, (along - bend.start) / Math.max(1, bend.length)));
  return bend.height * Math.exp(-u * u) * (1 - 0.55 * through) * Math.sin(((along - bend.front) / bend.wavelength) * TAU);
}

/** The surface at a point of the picture. */
export function surfaceAt(surface: Surface, x: number, y: number): SurfaceAt {
  let dx = 0;
  let dy = 0;
  let lit = 0;
  let bend = 0;
  for (const drop of surface.drops) {
    if (drop.age <= 0) continue;
    const ox = x - drop.x;
    const oy = y - drop.y;
    const r0 = Math.hypot(ox, oy);
    const r = r0 + wavered(drop, Math.atan2(oy, ox));
    const front = drop.speed * drop.age;
    const sigma = drop.wavelength * drop.width * 0.5 + drop.spread * drop.age;
    const u = (r - front) / sigma;
    if (u > 3.2) continue;
    // Behind the packet the water calms; ahead of it nothing has moved yet.
    const a = dropStrength(drop, r0) * Math.exp(-u * u);
    if (a < 1e-3) continue;
    const theta = (TAU / drop.wavelength) * (r - drop.phase * front);
    const near = Math.min(1, r0 / (drop.wavelength * 0.25));
    const slope = a * Math.sin(theta) * near;
    const nx = r0 > 1e-6 ? ox / r0 : 0;
    const ny = r0 > 1e-6 ? oy / r0 : 0;
    dx += slope * nx;
    dy += slope * ny;
    // Lit by its slope and its curve as shares of its full strength, so as it fades or calms its light goes too.
    lit += (slope / drop.strength) * (nx * LIGHT_X + ny * LIGHT_Y);
    bend += (a / drop.strength) * Math.cos(theta) * near;
  }
  for (const b of surface.bends ?? []) {
    const m = b.toFrame;
    const along = m[0] * x + m[2] * y + m[4];
    const lift = bendLift(b, along);
    dx += lift * b.down.x;
    dy += lift * b.down.y;
  }
  const light = (surface.glint ?? 0) * Math.max(0, lit) ** 1.6 + (surface.caustic ?? 0) * Math.max(0, bend) ** 2.2;
  return { dx, dy, light };
}

/** Whether a surface moves or lights anything at all: a still one is drawn as it is, the cover exactly. */
export function isStill(surface: Surface): boolean {
  const drops = surface.drops.every((d) => d.age <= 0 || dropStrength(d, 0) < STILL_BELOW);
  const bends = (surface.bends ?? []).every((b) => Math.abs(b.height) * Math.hypot(b.down.x, b.down.y) < STILL_BELOW);
  return drops && bends;
}

/** The farthest a surface sends the eye, in pixels of the picture: how far past an area to read from. */
export function reachOf(surface: Surface): number {
  let most = 0;
  for (const d of surface.drops) if (d.age > 0) most += dropStrength(d, 0);
  for (const b of surface.bends ?? []) most += Math.abs(b.height) * Math.hypot(b.down.x, b.down.y);
  return most;
}
