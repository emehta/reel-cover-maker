"use client";

/**
 * Reelic's cover for the projects page, drawn a frame at a time from the
 * maker's own engine (buildScene, paint, the paste's field and the GPU
 * light), never recorded and never redrawn by hand: every cover in it is
 * one the maker makes from the same title and colour.
 *
 * One take, 1600 by 2000 (twice the card's 800 by 1000), about ten
 * seconds: an iPhone with a profile's grid of reel covers, drawn as the
 * maker's own phone view draws it (phone.ts, dark); the camera dives into
 * the newest post; it swipes away, and "day in my life" is typed; it swipes up
 * through all six styles, each in its own colour, as reels swipe; the
 * last, Stickery, is the post the camera dives back out to; and the last
 * frame is the first.
 *
 * Close in, the card shows the reel as the feed does, its middle 4:5,
 * with the grid's 3:4 window a whole 67 pixels past the card's top, so a
 * post drawn there is the card pixel for pixel.
 *
 * `window.STAGE.seek(t)` draws the frame at t seconds; a renderer reads the
 * canvas after each.
 */

import {
  BatteryFull,
  CaretDown,
  CellSignalFull,
  FilmSlate,
  GridNine,
  House,
  List,
  MagnifyingGlass,
  PlusSquare,
  UserSquare,
  WifiHigh,
} from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { FaceId } from "@/components/reel-cover-maker/faces";
import { facesFor, fontCss, fontsSnapshot, interTight, measurerFor, requestFonts } from "@/components/reel-cover-maker/fonts";
import { shadeOnGpu } from "@/components/reel-cover-maker/liquid-gl";
import { liquidField, type LiquidField, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import { paint, type PaintOptions } from "@/components/reel-cover-maker/paint";
import { GROUNDS, type Ground } from "@/components/reel-cover-maker/palettes";
import {
  BEZEL,
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROWS,
  NAV_BAR,
  PHONE_HEIGHT,
  PHONE_WIDTH,
  SAFE_BOTTOM,
  SAFE_TOP,
  SCREEN_RADIUS,
  TAB_BAR,
  TABS_BAR,
  coverTile,
  gridArea,
  gridTile,
  phoneSize,
} from "@/components/reel-cover-maker/phone";
import { buildScene, letteringFace, type CoverInput, type LetteringId, type LiquidOp, type PastyLetteringId, type Scene, type StyleId } from "@/components/reel-cover-maker/scene";
import { clamp01, keystrokes, sine, span, swipe, typedCount } from "@/cover/timeline";

const FPS = 60;
const W = 1600;
const H = 2000;
/** The profile grid's window on a reel cover, in its pixels. */
const WINDOW_Y = 240;
const WINDOW_H = 1440;
/** Close in, the grid's window starts this far above the card's top: a whole number of pixels. */
const IN_TOP = -67;

/* ---- The phone at rest, in the card's pixels: the maker's phone view, as large as the card holds. ---- */

const PHONE = phoneSize();
/** Pixels to a point. */
const U = (H - 2 * 92) / PHONE.h;
const PHONE_X = (W - PHONE.w * U) / 2;
const PHONE_Y = (H - PHONE.h * U) / 2;
/** The screen's top left, in the card's pixels. */
const SX = PHONE_X + BEZEL * U;
const SY = PHONE_Y + BEZEL * U;
const POST = gridTile();
const COVER = coverTile();
/** The newest post at rest, in the card's pixels. */
const COVER_AT = { x: SX + COVER.x * U, y: SY + COVER.y * U, w: COVER.w * U, h: COVER.h * U };
/** How far in the camera is when that post fills the card's width. */
const ZOOM = W / COVER_AT.w;

/* Dark, as the phone view is in a dark system: Instagram's own night colours. */
const IG = { bg: "#000000", text: "#f5f5f5", muted: "#a8a8a8", line: "rgba(255, 255, 255, 0.18)", body: "#2a2a2d" };
const UI_FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;
const CARD = GROUNDS.light;

const TYPED_INK = "#1B1A18";
const TYPED_SIZE = 196;
const TITLE = "day in my life";

interface Spec {
  title: string;
  style: StyleId;
  hue: number;
  shade: number;
  ground: Ground;
  lettering?: LetteringId;
  pastyLettering?: PastyLetteringId;
}

/** The title through every style, each its own colour, dark and light grounds in turn; Stickery last, the post it becomes. */
const STYLES: Spec[] = [
  { title: TITLE, style: "echo", hue: 95, shade: 0.84, ground: "dark" },
  { title: TITLE, style: "editorial", hue: 26, shade: 0.45, ground: "light" },
  { title: TITLE, style: "pasty-flat", hue: 150, shade: 0.64, ground: "dark" },
  { title: TITLE, style: "mono", hue: 258, shade: 0.42, ground: "light" },
  { title: TITLE, style: "pasty", hue: 62, shade: 0.72, ground: "dark" },
  { title: TITLE, style: "stickery", hue: 352, shade: 0.55, ground: "light" },
];

/** The rest of the grid, row by row, the newest post in the middle row's middle; light and dark in turn round it. */
const GRID: (Spec | null)[] = [
  { title: "wild flower", style: "pasty", hue: 62, shade: 0.7, ground: "dark", pastyLettering: "drip" },
  { title: "taste test", style: "pasty-flat", hue: 352, shade: 0.52, ground: "light" },
  { title: "the plan", style: "pasty", hue: 302, shade: 0.66, ground: "dark", pastyLettering: "goo-even" },
  { title: "lisbon diaries", style: "editorial", hue: 258, shade: 0.42, ground: "light" },
  { title: "part two", style: "pasty", hue: 62, shade: 0.72, ground: "dark" },
  { title: "get *ready*", style: "stickery", hue: 302, shade: 0.5, ground: "light", lettering: "leckerli" },
  { title: "golden hour", style: "pasty-flat", hue: 95, shade: 0.84, ground: "dark" },
  null,
  { title: "night *out*", style: "stickery", hue: 26, shade: 0.58, ground: "dark", lettering: "damion" },
  { title: "studio tour", style: "pasty", hue: 210, shade: 0.48, ground: "light", pastyLettering: "goo-even" },
  { title: "desk tour", style: "pasty-flat", hue: 150, shade: 0.64, ground: "dark" },
  { title: "slow sundays", style: "editorial", hue: 40, shade: 0.5, ground: "light" },
  { title: "on repeat", style: "echo", hue: 258, shade: 0.6, ground: "dark" },
  { title: "sunday reset", style: "editorial", hue: 26, shade: 0.45, ground: "light" },
  { title: "big news", style: "pasty", hue: 352, shade: 0.62, ground: "dark" },
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
  const rest = 0.3;
  const diveIn = { from: rest, to: rest + 0.7 };
  // The newest post swipes away as the styles will, to the empty field: no fade, so nothing goes grey on its colour.
  const clear = { from: diveIn.to + 0.12, to: diveIn.to + 0.38 };
  const type = keystrokes(TITLE, clear.to + 0.12, 5, 0.048, 0.03, 0.035);
  const typed = type[type.length - 1] + 0.05;
  const swipes: { from: number; to: number }[] = [];
  let t = typed + 0.28;
  for (let i = 0; i < 6; i += 1) {
    swipes.push({ from: t, to: t + 0.26 });
    t += 0.26 + 0.5;
  }
  const diveOut = { from: t, to: t + 0.75 };
  const end = diveOut.to + 0.9;
  return { rest, diveIn, clear, type, swipes, diveOut, end };
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
function lighter(target: LiquidTarget): NonNullable<PaintOptions["liquid"]> {
  const fields = new Map<LiquidOp, LiquidField | null>();
  return (op, part) => {
    if (!fields.has(op)) fields.set(op, liquidField({ chains: op.chains, colourOf: op.colourOf, tone: op.tone, finish: op.finish, pool: op.pool, seed: op.seed }, target));
    const field = fields.get(op);
    if (!field) return null;
    const gpu = shadeOnGpu(field, { colours: op.colours, ground: op.ground, under: op.under, shadow: part === "shadow" }, op.seed);
    if (!gpu) throw new Error("no WebGL 2: the stage lights paste on the GPU only");
    return { image: gpu.canvas, sx: gpu.sx, sy: gpu.sy, w: field.w, h: field.h, x: field.x, y: field.y };
  };
}

interface Tile {
  canvas: HTMLCanvasElement;
  /** The grid window's size in the canvas. */
  w: number;
  h: number;
}

/**
 * A cover's grid window on its ground, as it reads once posted: the
 * maker's clear PNG laid on the colour it was lit for, `width` pixels
 * across (the card's for a post shown close, less for one only ever seen
 * in the grid or rushing past).
 */
function tileCanvas(scene: Scene, ground: Ground, width = W): Tile {
  const scale = width / 1080;
  const target: LiquidTarget = { width, height: Math.ceil(WINDOW_H * scale), scale, origin: { x: 0, y: WINDOW_Y } };
  const [c, ctx] = canvas(target.width, target.height);
  ctx.fillStyle = GROUNDS[ground];
  ctx.fillRect(0, 0, c.width, c.height);
  paint(ctx, scene, { scale, origin: target.origin, font: fontCss, grain: null, liquid: lighter(target) });
  return { canvas: c, w: width, h: WINDOW_H * scale };
}

/** Each icon's outline, from the Phosphor icons the phone view draws, as paths on a 256 grid. */
type Icons = Record<string, Path2D[]>;

function readIcons(root: HTMLElement): Icons {
  const icons: Icons = {};
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-icon]"))) {
    const svg = el.querySelector("svg");
    if (!svg) throw new Error(`icon ${el.dataset.icon} did not render`);
    const shapes = Array.from(svg.querySelectorAll("path, rect, circle, line, polyline, polygon"));
    if (shapes.some((s) => s.tagName.toLowerCase() !== "path")) throw new Error(`icon ${el.dataset.icon} is drawn with more than paths`);
    icons[el.dataset.icon as string] = shapes.map((s) => new Path2D(s.getAttribute("d") ?? ""));
  }
  return icons;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

async function waitForFonts(specs: Spec[]): Promise<number> {
  for (const s of specs) requestFonts(s.title, facesOf(s));
  await document.fonts.load(`400 ${TYPED_SIZE}px ${interTight.style.fontFamily}`, TITLE);
  await document.fonts.load(`600 40px ${UI_FONT}`, "9:41 eshaan.tm");
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

/* ---- The stage. ---- */

interface Built {
  draw: (t: number) => void;
  duration: number;
}

async function build(main: HTMLCanvasElement, iconRoot: HTMLElement): Promise<Built> {
  const all = [...STYLES, ...GRID.filter((s): s is Spec => !!s)];
  const loads = await waitForFonts(all);
  const measurer = measurerFor(loads);
  const icons = readIcons(iconRoot);
  const ctx = main.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const styleTiles = STYLES.map((spec) => tileCanvas(buildScene(inputOf(spec), measurer), spec.ground));
  const newestTile = styleTiles[styleTiles.length - 1];
  const gridTiles = GRID.map((spec) => (spec ? tileCanvas(buildScene(inputOf(spec), measurer), spec.ground, 1000) : newestTile));
  /** A post shown close: the card's 4:5 of it, `dy` down the card. */
  const close = (target: CanvasRenderingContext2D, tile: Tile, dy = 0) => target.drawImage(tile.canvas, 0, -IN_TOP, W, H, 0, dy, W, H);

  const typedFont = `400 ${TYPED_SIZE}px ${interTight.style.fontFamily}`;

  /** The typed line, as the maker's text field holds it: set from where the whole line will start, so it never shifts. */
  function typed(target: CanvasRenderingContext2D, count: number, caret: number, dy = 0) {
    target.save();
    target.font = typedFont;
    target.textBaseline = "alphabetic";
    const full = target.measureText(TITLE).width;
    const cap = target.measureText("H").actualBoundingBoxAscent;
    const x0 = (W - full) / 2;
    const base = H / 2 + cap / 2 + dy;
    const shown = TITLE.slice(0, count);
    target.fillStyle = TYPED_INK;
    target.fillText(shown, x0, base);
    if (caret > 0) {
      target.globalAlpha = caret;
      target.fillRect(x0 + target.measureText(shown).width + 9, base - cap * 1.22, 9, cap * 1.6);
    }
    target.restore();
  }

  /** An icon, `size` points square, its top left at (x, y) in points on the screen. */
  function icon(target: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string) {
    const paths = icons[name];
    if (!paths) throw new Error(`no icon ${name}`);
    target.save();
    target.translate(SX + x * U, SY + y * U);
    target.scale((size * U) / 256, (size * U) / 256);
    target.fillStyle = color;
    for (const p of paths) target.fill(p);
    target.restore();
  }

  /** A reel's mark, at a post's top right, as the grid marks one; `alpha` fades it as the camera goes in. */
  function reelMark(target: CanvasRenderingContext2D, x: number, y: number, w: number, alpha: number) {
    if (alpha <= 0) return;
    const size = 18 * U;
    const zoom = target.getTransform().a;
    target.save();
    target.globalAlpha = alpha;
    target.translate(x + w - 7 * U - size, y + 7 * U);
    target.scale(size / 24, size / 24);
    // A tight edge of shadow, so the white mark shows on a light post as on a dark one without a smudge.
    target.shadowColor = "rgba(0, 0, 0, 0.5)";
    target.shadowBlur = 1.2 * U * zoom;
    target.strokeStyle = "#ffffff";
    target.fillStyle = "#ffffff";
    target.lineWidth = 2;
    target.lineJoin = "round";
    roundRect(target, 3, 3, 18, 18, 5);
    target.stroke();
    target.stroke(new Path2D("M3 8.5h18M9 3l3 5.5M14.5 3l3 5.5"));
    target.fill(new Path2D("M10 11.6v5.3c0 .5.5.8.9.5l4.2-2.6c.4-.3.4-.8 0-1.1l-4.2-2.6c-.4-.3-.9 0-.9.5Z"));
    target.restore();
  }

  /** The phone, drawn in the card's pixels at rest; the camera is the context's transform. */
  function phone(target: CanvasRenderingContext2D) {
    const pw = PHONE.w * U;
    const ph = PHONE.h * U;
    // A canvas's shadow is in the canvas's own pixels whatever the transform, so it is scaled with the camera.
    const zoom = target.getTransform().a;
    // The marks are the grid's at rest, gone before the camera is close.
    const marks = clamp01(1 - (zoom - 1) / 0.5);
    // The phone's body, its glass and its shadow.
    target.save();
    target.shadowColor = "rgba(0, 0, 0, 0.22)";
    target.shadowBlur = 48 * 2 * zoom;
    target.shadowOffsetY = 18 * 2 * zoom;
    roundRect(target, PHONE_X, PHONE_Y, pw, ph, (SCREEN_RADIUS + BEZEL) * U);
    target.fillStyle = IG.body;
    target.fill();
    target.restore();
    target.save();
    roundRect(target, PHONE_X + 0.5, PHONE_Y + 0.5, pw - 1, ph - 1, (SCREEN_RADIUS + BEZEL) * U);
    target.strokeStyle = "rgba(255, 255, 255, 0.1)";
    target.lineWidth = 1.5;
    target.stroke();
    target.restore();

    // The screen.
    target.save();
    roundRect(target, SX, SY, PHONE_WIDTH * U, PHONE_HEIGHT * U, SCREEN_RADIUS * U);
    target.clip();
    target.fillStyle = IG.bg;
    target.fillRect(SX, SY, PHONE_WIDTH * U, PHONE_HEIGHT * U);

    // The grid, under the tabs and over the tab bar, the newest post in its middle.
    const area = gridArea();
    target.save();
    target.beginPath();
    target.rect(SX, SY + area.top * U, PHONE_WIDTH * U, (area.bottom - area.top) * U);
    target.clip();
    const middleRow = Math.floor(GRID_ROWS / 2);
    gridTiles.forEach((tile, i) => {
      const r = Math.floor(i / GRID_COLUMNS);
      const c = i % GRID_COLUMNS;
      const x = SX + c * (POST.w + GRID_GAP) * U;
      const y = SY + (COVER.y + (r - middleRow) * (POST.h + GRID_GAP)) * U;
      target.drawImage(tile.canvas, 0, 0, tile.w, tile.h, x, y, POST.w * U, POST.h * U);
      reelMark(target, x, y, POST.w * U, marks);
    });
    target.restore();

    // The status bar round the Dynamic Island.
    target.fillStyle = IG.text;
    target.font = `600 ${17 * U}px ${UI_FONT}`;
    target.textAlign = "center";
    target.textBaseline = "middle";
    const statusMid = (5 + 54) / 2;
    const side = (PHONE_WIDTH - 125) / 2;
    target.fillText("9:41", SX + (side / 2) * U, SY + statusMid * U);
    roundRect(target, SX + side * U, SY + 6 * U, 125 * U, 37 * U, 18.5 * U);
    target.fillStyle = "#000000";
    target.fill();
    const signals = PHONE_WIDTH - side / 2;
    icon(target, "signal", signals - 33, statusMid - 9, 18, IG.text);
    icon(target, "wifi", signals - 10, statusMid - 9, 18, IG.text);
    icon(target, "battery", signals + 13, statusMid - 13, 26, IG.text);

    // The profile's name, and its tabs.
    const navMid = SAFE_TOP + NAV_BAR / 2;
    target.fillStyle = IG.text;
    target.font = `700 ${20 * U}px ${UI_FONT}`;
    target.textAlign = "left";
    // The owner's own account, public, so with no lock by its name, as the phone view shows it.
    const name = "eshaan.tm";
    target.fillText(name, SX + 16 * U, SY + navMid * U);
    const nameW = target.measureText(name).width / U;
    icon(target, "caret", 16 + nameW + 5, navMid - 7, 14, IG.text);
    icon(target, "plus", PHONE_WIDTH - 16 - 27 - 22 - 27, navMid - 13.5, 27, IG.text);
    icon(target, "list", PHONE_WIDTH - 16 - 27, navMid - 13.5, 27, IG.text);
    const tabsTop = SAFE_TOP + NAV_BAR;
    const third = PHONE_WIDTH / 3;
    ["grid", "film", "user"].forEach((name, i) => icon(target, name, third * i + third / 2 - 12, tabsTop + TABS_BAR / 2 - 12, 24, i === 0 ? IG.text : IG.muted));
    target.fillStyle = IG.text;
    target.fillRect(SX, SY + (tabsTop + TABS_BAR - 1) * U, third * U, 1 * U);
    target.fillStyle = IG.line;
    target.fillRect(SX + third * U, SY + (tabsTop + TABS_BAR - 0.5) * U, (PHONE_WIDTH - third) * U, 0.5 * U);

    // The tab bar over the home indicator.
    const barTop = PHONE_HEIGHT - SAFE_BOTTOM - TAB_BAR;
    target.fillStyle = IG.bg;
    target.fillRect(SX, SY + barTop * U, PHONE_WIDTH * U, (TAB_BAR + SAFE_BOTTOM) * U);
    target.fillStyle = IG.line;
    target.fillRect(SX, SY + (barTop - 0.5) * U, PHONE_WIDTH * U, 0.5 * U);
    const fifth = PHONE_WIDTH / 5;
    const barMid = barTop + TAB_BAR / 2;
    ["house", "search", "plus", "film"].forEach((name, i) => icon(target, name, fifth * i + fifth / 2 - 13, barMid - 13, 26, IG.text));
    const meX = SX + (fifth * 4 + fifth / 2) * U;
    target.beginPath();
    target.arc(meX, SY + barMid * U, (13 + 3) * U, 0, Math.PI * 2);
    target.fillStyle = IG.text;
    target.fill();
    target.beginPath();
    target.arc(meX, SY + barMid * U, (13 + 1.5) * U, 0, Math.PI * 2);
    target.fillStyle = IG.bg;
    target.fill();
    // The profile's own picture: a warm one, so the tab reads as a face, not an empty ring.
    const avatar = target.createLinearGradient(meX - 13 * U, SY + (barMid - 13) * U, meX + 13 * U, SY + (barMid + 13) * U);
    avatar.addColorStop(0, "#f6a04d");
    avatar.addColorStop(1, "#e1306c");
    target.beginPath();
    target.arc(meX, SY + barMid * U, 13 * U, 0, Math.PI * 2);
    target.fillStyle = avatar;
    target.fill();
    roundRect(target, SX + ((PHONE_WIDTH - 134) / 2) * U, SY + (PHONE_HEIGHT - 8 - 5) * U, 134 * U, 5 * U, 2.5 * U);
    target.fillStyle = IG.text;
    target.fill();
    target.restore();
  }

  /** The card at a zoom: the phone drawn back from, about a point near the newest post, so everything travels in a straight line. */
  function camera(target: CanvasRenderingContext2D, zoom: number) {
    if (Math.abs(zoom - ZOOM) < 1e-6) {
      // All the way in, the newest post is the card pixel for pixel, never resampled.
      close(target, newestTile);
      return;
    }
    const f = (zoom - 1) / (ZOOM - 1);
    const tx = -ZOOM * COVER_AT.x * f;
    const ty = (IN_TOP - ZOOM * COVER_AT.y) * f;
    target.fillStyle = CARD;
    target.fillRect(0, 0, W, H);
    target.save();
    target.setTransform(zoom, 0, 0, zoom, tx, ty);
    phone(target);
    target.restore();
  }

  /** The style cycle: the typed line, then each style swiping up over the one before. */
  function styles(target: CanvasRenderingContext2D, t: number) {
    // Which swipe is the latest begun, and how far through it.
    let k = -1;
    for (let i = 0; i < T.swipes.length; i += 1) if (t >= T.swipes[i].from) k = i;
    const drawFrame = (i: number, dy: number) => {
      if (i < 0) {
        target.fillStyle = CARD;
        target.fillRect(0, dy, W, H);
        typed(target, TITLE.length, 1, dy);
      } else {
        close(target, styleTiles[i], dy);
      }
    };
    if (k < 0) {
      drawFrame(-1, 0);
      return;
    }
    const u = swipe(span(t, T.swipes[k].from, T.swipes[k].to));
    if (u >= 1) {
      drawFrame(k, 0);
      return;
    }
    drawFrame(k - 1, -u * H);
    drawFrame(k, (1 - u) * H);
  }

  function draw(t: number) {
    ctx!.save();
    ctx!.globalAlpha = 1;
    ctx!.globalCompositeOperation = "source-over";
    if (t < T.diveIn.to) {
      // In log scale on a sine, so the zoom never crawls and then whips.
      camera(ctx!, Math.exp(Math.log(ZOOM) * sine(span(t, T.diveIn.from, T.diveIn.to))));
    } else if (t < T.clear.from) {
      close(ctx!, newestTile);
    } else if (t < T.clear.to) {
      // The newest post swipes up and away, the empty field with its caret coming up under it.
      const u = swipe(span(t, T.clear.from, T.clear.to));
      close(ctx!, newestTile, -u * H);
      ctx!.fillStyle = CARD;
      ctx!.fillRect(0, (1 - u) * H, W, H);
      typed(ctx!, 0, 1, (1 - u) * H);
    } else if (t < T.swipes[0].from) {
      ctx!.fillStyle = CARD;
      ctx!.fillRect(0, 0, W, H);
      typed(ctx!, typedCount(T.type, t), 1);
    } else if (t < T.diveOut.from) {
      styles(ctx!, t);
    } else {
      camera(ctx!, Math.exp(Math.log(ZOOM) * (1 - sine(span(t, T.diveOut.from, T.diveOut.to)))));
    }
    ctx!.restore();
  }

  return { draw, duration: Math.round(T.end * FPS) / FPS };
}

declare global {
  interface Window {
    STAGE?: { ready: Promise<void>; duration: number; fps: number; beats: typeof T; seek: (t: number) => Promise<void> };
  }
}

/** The phone view's icons, drawn once out of sight so their outlines can be read. */
function IconSource({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 1, height: 1, overflow: "hidden" }}>
      {children}
    </div>
  );
}

export default function Stage() {
  const ref = useRef<HTMLCanvasElement>(null);
  const iconsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const main = ref.current;
    const iconRoot = iconsRef.current;
    if (!main || !iconRoot || window.STAGE) return;
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
    stage.ready = build(main, iconRoot).then((b) => {
      built = b;
      stage.duration = b.duration;
    });
    window.STAGE = stage;
  }, []);
  return (
    <>
      <canvas ref={ref} id="stage" width={W} height={H} style={{ position: "fixed", left: 0, top: 0, width: W, height: H, display: "block" }} />
      <IconSource>
        <div ref={iconsRef}>
          <span data-icon="signal"><CellSignalFull weight="fill" /></span>
          <span data-icon="wifi"><WifiHigh weight="bold" /></span>
          <span data-icon="battery"><BatteryFull weight="fill" /></span>
          <span data-icon="caret"><CaretDown weight="bold" /></span>
          <span data-icon="plus"><PlusSquare /></span>
          <span data-icon="list"><List /></span>
          <span data-icon="grid"><GridNine /></span>
          <span data-icon="film"><FilmSlate /></span>
          <span data-icon="user"><UserSquare /></span>
          <span data-icon="house"><House /></span>
          <span data-icon="search"><MagnifyingGlass /></span>
        </div>
      </IconSource>
    </>
  );
}
