"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import type { Rect } from "@/components/reel-cover-maker/formats";
import { DEFAULT_FRAME, panFrame, zoomFrame, type PhotoFrame } from "@/components/reel-cover-maker/photo";
import {
  HANDLES,
  boxCorners,
  boxPoint,
  dragHandle,
  insideBox,
  keepOnCover,
  moveBy,
  pinchTo,
  scaleAbout,
  snapToMiddle,
  turnHandle,
  turnSide,
  turnBy,
  turnTo,
  type Place,
  type Point,
} from "@/components/reel-cover-maker/place";

interface Props {
  surfaceRef: RefObject<HTMLDivElement | null>;
  /** The picture's size, in its own pixels. */
  width: number;
  height: number;
  /** The box round the letters before they are placed; null with nothing to move. */
  box: Rect | null;
  place: Place;
  /** A placement settled on, at the end of a gesture or a key press. */
  onPlace: (place: Place) => void;
  /** The placement while a gesture runs, for the page to show at once; null when it ends or is called off. */
  onLive: (place: Place | null) => void;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  photo: { w: number; h: number } | null;
  frame: PhotoFrame;
  onFrame: (frame: PhotoFrame) => void;
  /** A double click on the letters: to change what they say. */
  onEditText: () => void;
  /** Whether the letters are drawn within `reach` of a point, so a press between them on a photo moves the photo. */
  inkAt: (p: Point, reach: number) => boolean;
  /** The part of the page the preview has: the box and its handles are drawn only there, never over the controls. */
  clipRef: RefObject<HTMLElement | null>;
}

/** Sizes on screen, in CSS pixels, whatever the preview's size. */
const HANDLE = 10;
const HIT = 14;
/** A finger's reach: a handle is as easy to press as any button on a phone. */
const TOUCH_HIT = 22;
/** How near the letters a press on a photo must be to take them, not the photo. */
const INK_REACH = 6;
const TURN_REACH = 28;
const SNAP = 8;
/** How far a press must move before it is a drag, not a click. */
const SLOP = 3;

type Gesture =
  | { kind: "move"; from: Place; start: Point; moved: boolean }
  | { kind: "handle"; from: Place; u: number; v: number }
  | { kind: "turn"; from: Place; start: Point }
  | { kind: "pinchText"; from: Place; a0: Point; b0: Point }
  | { kind: "pan"; from: PhotoFrame; start: Point }
  | { kind: "pinch"; from: PhotoFrame; d: number; mid: Point };

/** A handle's cursor, turned with the box, so it always points the way the handle pulls. */
function resizeCursor(u: number, v: number, angle: number): string {
  const deg = (((Math.atan2(v, u) + angle) * 180) / Math.PI + 360) % 180;
  const names = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
  return names[Math.round(deg / 45) % 4];
}

/**
 * The cover's surface, over the preview, as an illustration program's
 * canvas. A press on the letters selects them: a box round them with a
 * handle at each corner and side and one above to turn them. Dragged
 * inside, they move, drawn to the cover's middle near it with a guide;
 * a corner scales them keeping their shape (Shift frees it, Alt scales from
 * the middle); a side stretches one way; the handle above turns them
 * (Shift in steps of fifteen degrees). Two fingers on them move, scale and
 * turn them at once. The arrow keys nudge them (Shift ten times as far);
 * Escape lets go.
 *
 * Off the letters, the photo behind them is dragged to move it, pinched or
 * scrolled to zoom about the fingers or the pointer, and double-clicked to
 * fit it whole again. Every move is worked out in the picture's own pixels
 * from where the gesture began, so nothing drifts.
 */
export function CoverSurface({ surfaceRef, width, height, box, place, onPlace, onLive, selected, onSelect, photo, frame, onFrame, onEditText, inkAt, clipRef }: Props) {
  const clipId = useId();
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const liveRef = useRef<Place | null>(null);
  const [live, setLive] = useState<Place | null>(null);
  const [guides, setGuides] = useState({ across: false, down: false });
  const [turning, setTurning] = useState(false);
  const [cursor, setCursor] = useState("default");
  /** The pointer is over the letters, not yet selected: a faint box says they can be. */
  const [hovering, setHovering] = useState(false);
  const [perPixel, setPerPixel] = useState(1);
  /** The preview's part of the page, in the picture's pixels. */
  const [clip, setClip] = useState<Rect | null>(null);
  /** A trackpad's pinch on the letters, settled once it stops. */
  const wheelTimer = useRef(0);
  // The latest of what the gestures read, kept as they started from it.
  const latest = useRef({ place, frame, box, photo, onPlace, onLive, onFrame, onSelect, selected, inkAt });
  useEffect(() => {
    latest.current = { place, frame, box, photo, onPlace, onLive, onFrame, onSelect, selected, inkAt };
  });

  // The picture's pixels to each of the screen's, for handles a fixed size on screen, and where the preview's room ends.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => {
      const r = surface.getBoundingClientRect();
      if (!r.width) return;
      const k = width / r.width;
      setPerPixel(k);
      const room = clipRef.current?.getBoundingClientRect();
      setClip(room ? { x: (room.left - r.left) * k, y: (room.top - r.top) * k, w: room.width * k, h: room.height * k } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    if (clipRef.current) observer.observe(clipRef.current);
    return () => observer.disconnect();
  }, [surfaceRef, clipRef, width]);

  // A press anywhere off the cover lets the letters go.
  useEffect(() => {
    if (!selected) return;
    const away = (event: PointerEvent) => {
      if (!surfaceRef.current?.contains(event.target as Node)) latest.current.onSelect(false);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [selected, surfaceRef]);

  /** A point of the window in the picture's own pixels. */
  const toPicture = (p: Point): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return p;
    return { x: ((p.x - rect.left) / rect.width) * width, y: ((p.y - rect.top) / rect.height) * height };
  };

  /**
   * What a point of the picture is on: a handle, the turning handle, the
   * letters, or nothing of them. Selected, the whole box is the letters';
   * not yet, on a photo, only the letters themselves are, so a press
   * between them still moves the photo.
   */
  const hit = (p: Point, touch = false): { kind: "handle"; u: number; v: number } | { kind: "turn" } | { kind: "inside" } | null => {
    const { box: b, place: pl, selected: on, photo: ph } = latest.current;
    if (!b) return null;
    const reach = (touch ? TOUCH_HIT : HIT) * perPixel;
    if (on) {
      const turn = turnHandle(b, pl, TURN_REACH * perPixel, turnSide(b, pl, TURN_REACH * perPixel, { w: width, h: height }));
      if (Math.hypot(p.x - turn.x, p.y - turn.y) < reach) return { kind: "turn" };
      for (const h of HANDLES) {
        const at = boxPoint(b, pl, h.u, h.v);
        if (Math.hypot(p.x - at.x, p.y - at.y) < reach) return { kind: "handle", u: h.u, v: h.v };
      }
    }
    if (!insideBox(b, pl, p, on ? 2 * perPixel : 0)) return null;
    return on || !ph || latest.current.inkAt(p, (touch ? INK_REACH * 2 : INK_REACH) * perPixel) ? { kind: "inside" } : null;
  };

  const show = (next: Place | null) => {
    liveRef.current = next;
    setLive(next);
    latest.current.onLive(next);
  };

  const settle = () => {
    const g = gesture.current;
    const next = liveRef.current;
    if (g && g.kind !== "pan" && g.kind !== "pinch" && next && latest.current.box) {
      latest.current.onPlace(keepOnCover(latest.current.box, next, { w: width, h: height }));
    }
    show(null);
    setGuides({ across: false, down: false });
    setTurning(false);
    if (g?.kind === "pan") setCursor("grab");
  };

  const begin = (target: ReturnType<typeof hit>, p: Point) => {
    const points = [...pointers.current.values()].map(toPicture);
    const { place: pl, frame: fr, photo: ph } = latest.current;
    const text = gesture.current?.kind === "move" || gesture.current?.kind === "pinchText" || target !== null;
    if (points.length >= 2) {
      if (text && latest.current.box) gesture.current = { kind: "pinchText", from: liveRef.current ?? pl, a0: points[0], b0: points[1] };
      else if (ph) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = { kind: "pinch", from: fr, d: Math.hypot(b.x - a.x, b.y - a.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      }
      return;
    }
    if (!target) {
      gesture.current = ph ? { kind: "pan", from: fr, start: p } : null;
      if (ph) setCursor("grabbing");
      return;
    }
    if (target.kind === "turn") {
      gesture.current = { kind: "turn", from: pl, start: toPicture(p) };
      setTurning(true);
    } else if (target.kind === "handle") gesture.current = { kind: "handle", from: pl, u: target.u, v: target.v };
    else gesture.current = { kind: "move", from: pl, start: toPicture(p), moved: false };
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    // Focused for the arrow keys, without the ring a keyboard's focus shows.
    if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const target = pointers.current.size === 1 ? hit(toPicture({ x: event.clientX, y: event.clientY }), event.pointerType !== "mouse") : null;
    if (pointers.current.size === 1) latest.current.onSelect(target !== null);
    begin(target, { x: event.clientX, y: event.clientY });
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) {
      // Hovering: the cursor says what a press would do.
      const t = hit(toPicture({ x: event.clientX, y: event.clientY }));
      const angle = latest.current.place.angle;
      setHovering(t?.kind === "inside" && !latest.current.selected);
      setCursor(!t ? (latest.current.photo ? "grab" : "default") : t.kind === "turn" ? "grab" : t.kind === "handle" ? resizeCursor(t.u, t.v, angle) : "move");
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    const b = latest.current.box;
    if (!g) return;
    const p = toPicture({ x: event.clientX, y: event.clientY });
    const ph = latest.current.photo;
    switch (g.kind) {
      case "move": {
        if (!b) return;
        if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < SLOP * perPixel) return;
        g.moved = true;
        const snapped = event.altKey ? { place: moveBy(g.from, p.x - g.start.x, p.y - g.start.y), across: false, down: false } : snapToMiddle(b, moveBy(g.from, p.x - g.start.x, p.y - g.start.y), { w: width, h: height }, SNAP * perPixel);
        setGuides({ across: snapped.across, down: snapped.down });
        show(snapped.place);
        return;
      }
      case "handle":
        if (b) show(dragHandle(b, g.from, g, p, { free: event.shiftKey, fromMiddle: event.altKey }));
        return;
      case "turn":
        if (b) show(turnTo(b, g.from, g.start, p, event.shiftKey));
        return;
      case "pinchText": {
        const [a, c] = [...pointers.current.values()].map(toPicture);
        if (b && a && c) show(pinchTo(b, g.from, g.a0, g.b0, a, c));
        return;
      }
      case "pan":
        if (ph) {
          const k = perPixel;
          latest.current.onFrame(panFrame(g.from, (event.clientX - g.start.x) * k, (event.clientY - g.start.y) * k, ph.w, ph.h, width, height));
        }
        return;
      case "pinch": {
        const [a, c] = [...pointers.current.values()];
        if (!ph || !a || !c) return;
        const d = Math.hypot(c.x - a.x, c.y - a.y) || 1;
        const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        const zoomed = zoomFrame(g.from, d / g.d, toPicture(g.mid), ph.w, ph.h, width, height);
        latest.current.onFrame(panFrame(zoomed, (mid.x - g.mid.x) * perPixel, (mid.y - g.mid.y) * perPixel, ph.w, ph.h, width, height));
      }
    }
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      settle();
      gesture.current = null;
    } else if (g && (g.kind === "pinchText" || g.kind === "pinch")) {
      // One finger lifted from two: the other carries on moving what was being pinched.
      if (g.kind === "pinchText") {
        const next = liveRef.current ?? g.from;
        const [rest] = [...pointers.current.values()];
        gesture.current = { kind: "move", from: next, start: toPicture(rest), moved: true };
      } else {
        const [rest] = [...pointers.current.values()];
        gesture.current = { kind: "pan", from: latest.current.frame, start: rest };
      }
    }
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const b = latest.current.box;
    if (event.key === "Escape") {
      if (gesture.current) {
        gesture.current = null;
        pointers.current.clear();
        show(null);
        setGuides({ across: false, down: false });
        setTurning(false);
      } else latest.current.onSelect(false);
      return;
    }
    if (!b || !latest.current.selected || event.metaKey || event.ctrlKey || event.altKey) return;
    const pl = latest.current.place;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const by = moves[event.key];
    // Plus and minus scale about the middle; the brackets turn, a degree or fifteen with Shift.
    const middle = boxPoint(b, pl, 0, 0);
    const next = by
      ? moveBy(pl, by[0], by[1])
      : event.key === "+" || event.key === "="
        ? scaleAbout(b, pl, event.shiftKey ? 1.25 : 1.05, middle)
        : event.key === "-" || event.key === "_"
          ? scaleAbout(b, pl, event.shiftKey ? 0.8 : 1 / 1.05, middle)
          : event.key === "[" || event.key === "{" || event.key === "]" || event.key === "}"
            ? turnBy(pl, ((event.key === "[" || event.key === "{" ? -1 : 1) * (event.shiftKey ? 15 : 1) * Math.PI) / 180)
            : null;
    if (!next) return;
    event.preventDefault();
    latest.current.onPlace(keepOnCover(b, next, { w: width, h: height }));
  };

  // A wheel, or a trackpad's pinch (a wheel with Control held), zooms the photo about the pointer.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      const { photo: ph, selected: on, box: b } = latest.current;
      const step = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const factor = Math.exp(-step * (event.ctrlKey ? 0.01 : 0.0015));
      const rect = surface.getBoundingClientRect();
      const at = { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height };
      // Over the selected letters, they scale about the pointer: shown at once, settled when the wheel stops.
      const from = liveRef.current ?? latest.current.place;
      if (on && b && !gesture.current && insideBox(b, from, at)) {
        event.preventDefault();
        show(scaleAbout(b, from, factor, at));
        window.clearTimeout(wheelTimer.current);
        wheelTimer.current = window.setTimeout(() => {
          const settled = liveRef.current;
          if (settled && latest.current.box) latest.current.onPlace(keepOnCover(latest.current.box, settled, { w: width, h: height }));
          show(null);
        }, 220);
        return;
      }
      if (!ph) return;
      event.preventDefault();
      latest.current.onFrame(zoomFrame(latest.current.frame, factor, at, ph.w, ph.h, width, height));
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      surface.removeEventListener("wheel", onWheel);
      window.clearTimeout(wheelTimer.current);
    };
  }, [surfaceRef, width, height]);

  const shown = live ?? place;
  const k = perPixel;
  const corners = box ? boxCorners(box, shown) : [];
  // The side is the settled placement's, so the handle never jumps round the box mid-turn.
  const side = box ? turnSide(box, place, TURN_REACH * k, { w: width, h: height }) : -1;
  const turnAt = box ? turnHandle(box, shown, TURN_REACH * k, side) : null;
  const topAt = box ? boxPoint(box, shown, 0, side) : null;
  const at = (p: Point) => ({ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` });
  /** A handle the preview has room for: one past its edge is neither drawn nor pressed. */
  const inRoom = (p: Point) => !clip || (p.x >= clip.x && p.x <= clip.x + clip.w && p.y >= clip.y && p.y <= clip.y + clip.h);
  const handleCorners = (c: Point) => {
    const s = (HANDLE * k) / 2;
    const cos = Math.cos(shown.angle);
    const sin = Math.sin(shown.angle);
    return [
      [-s, -s],
      [s, -s],
      [s, s],
      [-s, s],
    ]
      .map(([x, y]) => `${c.x + x * cos - y * sin},${c.y + x * sin + y * cos}`)
      .join(" ");
  };
  const degrees = Math.round((shown.angle * 180) / Math.PI);

  return (
    <div
      ref={surfaceRef}
      className={styles.surface}
      style={{ cursor }}
      tabIndex={0}
      role="application"
      aria-label="The cover. Press the text to select it, then drag to move it, drag its corners or sides to scale it, or its top handle to turn it. Arrow keys nudge it."
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={() => {
        setHovering(false);
        if (!pointers.current.size) setCursor("default");
      }}
      onKeyDown={onKey}
      onDoubleClick={(event) => {
        const on = hit(toPicture({ x: event.clientX, y: event.clientY }));
        if (on?.kind === "inside") onEditText();
        else if (!on && latest.current.photo) latest.current.onFrame({ ...DEFAULT_FRAME, flip: latest.current.frame.flip });
      }}
    >
      <svg className={styles.overlay} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {clip && (
          <defs>
            <clipPath id={clipId}>
              <rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} />
            </clipPath>
          </defs>
        )}
        <g clipPath={clip ? `url(#${clipId})` : undefined}>
        {guides.across && <line className={styles.guide} x1={width / 2} y1={0} x2={width / 2} y2={height} />}
        {guides.down && <line className={styles.guide} x1={0} y1={height / 2} x2={width} y2={height / 2} />}
        {hovering && !selected && box && corners.length === 4 && <polygon className={styles.hoverBox} points={corners.map((c) => `${c.x},${c.y}`).join(" ")} />}
        {selected && box && corners.length === 4 && (
          <>
            <polygon className={styles.selection} points={corners.map((c) => `${c.x},${c.y}`).join(" ")} />
            {topAt && turnAt && <line className={styles.selection} x1={topAt.x} y1={topAt.y} x2={turnAt.x} y2={turnAt.y} />}
            {HANDLES.map((h) => (
              <polygon key={h.id} className={styles.handle} points={handleCorners(boxPoint(box, shown, h.u, h.v))} />
            ))}
            {turnAt && <circle className={styles.turnHandle} cx={turnAt.x} cy={turnAt.y} r={(HANDLE * k) / 1.6} />}
          </>
        )}
        </g>
      </svg>
      {/* Where a handle may be pressed, even past the cover's edge: the press is told apart by where it lands, as on the cover. */}
      {selected && box && (
        <>
          {HANDLES.map((h) => {
            const p = boxPoint(box, shown, h.u, h.v);
            return inRoom(p) ? <span key={h.id} className={styles.hitSpot} style={at(p)} /> : null;
          })}
          {turnAt && inRoom(turnAt) && <span className={styles.hitSpot} style={at(turnAt)} />}
        </>
      )}
      {turning && turnAt && (
        <span className={styles.angle} style={at(turnAt)}>
          {degrees}°
        </span>
      )}
    </div>
  );
}
