"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { DEFAULT_FRAME, panFrame, zoomFrame, type PhotoFrame } from "@/components/reel-cover-maker/photo";

interface Props {
  surfaceRef: RefObject<HTMLDivElement | null>;
  /** The picture's size, in its own pixels. */
  width: number;
  height: number;
  photo: { w: number; h: number };
  frame: PhotoFrame;
  onFrame: (frame: PhotoFrame) => void;
}

type Point = { x: number; y: number };

/**
 * The cover's surface, over the preview: the photo behind the letters is
 * dragged to move it, pinched or scrolled to zoom about the fingers or the
 * pointer, and double-clicked to fit it whole again. Every move is worked
 * out in the picture's own pixels from where the gesture began, so it
 * never drifts.
 */
export function PhotoSurface({ surfaceRef, width, height, photo, frame, onFrame }: Props) {
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ kind: "pan"; from: Point; frame: PhotoFrame } | { kind: "pinch"; d: number; mid: Point; frame: PhotoFrame } | null>(null);
  const frameRef = useRef(frame);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    frameRef.current = frame;
    onFrameRef.current = onFrame;
  });

  /** A point of the window to the picture's own pixels. */
  const toPicture = (p: Point): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return p;
    return { x: ((p.x - rect.left) / rect.width) * width, y: ((p.y - rect.top) / rect.height) * height };
  };
  const scale = () => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return rect && rect.width ? width / rect.width : 1;
  };

  const begin = () => {
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const [a, b] = points;
      gesture.current = { kind: "pinch", d: Math.hypot(b.x - a.x, b.y - a.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, frame: frameRef.current };
    } else if (points.length === 1) {
      gesture.current = { kind: "pan", from: points[0], frame: frameRef.current };
    } else {
      gesture.current = null;
    }
  };

  const move = () => {
    const g = gesture.current;
    if (!g) return;
    const points = [...pointers.current.values()];
    const k = scale();
    if (g.kind === "pan" && points.length === 1) {
      const p = points[0];
      onFrameRef.current(panFrame(g.frame, (p.x - g.from.x) * k, (p.y - g.from.y) * k, photo.w, photo.h, width, height));
    } else if (g.kind === "pinch" && points.length >= 2) {
      const [a, b] = points;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomFrame(g.frame, d / g.d, toPicture(g.mid), photo.w, photo.h, width, height);
      onFrameRef.current(panFrame(zoomed, (mid.x - g.mid.x) * k, (mid.y - g.mid.y) * k, photo.w, photo.h, width, height));
    }
  };

  // A wheel, or a trackpad's pinch (a wheel with Control held), zooms about the pointer; the page is not scrolled.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const step = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const factor = Math.exp(-step * (event.ctrlKey ? 0.01 : 0.0015));
      const rect = surface.getBoundingClientRect();
      const at = { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height };
      onFrameRef.current(zoomFrame(frameRef.current, factor, at, photo.w, photo.h, width, height));
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [surfaceRef, width, height, photo.w, photo.h]);

  return (
    <div
      ref={surfaceRef}
      className={styles.surface}
      role="presentation"
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        begin();
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        move();
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        begin();
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);
        begin();
      }}
      onDoubleClick={() => onFrameRef.current({ ...DEFAULT_FRAME, flip: frameRef.current.flip })}
    />
  );
}
