"use client";

import { ArrowCounterClockwise, ArrowUUpLeft, ArrowUUpRight, Check, DownloadSimple, Moon, Shuffle, Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { hueTrack, shadeTrack, sliderColour } from "@/components/reel-cover-maker/colour";
import { Camera } from "@/components/reel-cover-maker/Camera";
import { CoverSurface } from "@/components/reel-cover-maker/CoverSurface";
import { loadDesign, saveDesign, type Design } from "@/components/reel-cover-maker/design";
import { Dropdown } from "@/components/reel-cover-maker/Dropdown";
import { PLAIN_FACES, type FaceId } from "@/components/reel-cover-maker/faces";
import { facesFor, fontCss, fontsSnapshot, interTight, measurerFor, requestFonts, subscribeFonts } from "@/components/reel-cover-maker/fonts";
import { FORMATS, formatById, type Format } from "@/components/reel-cover-maker/formats";
import { GRAIN_TILE, grainPixels } from "@/components/reel-cover-maker/grain";
import { emptyHistory, record, redo as redoStep, seal, undo as undoStep, type History } from "@/components/reel-cover-maker/history";
import { APP_NAME } from "@/components/reel-cover-maker/meta";
import { paint, type PaintOptions } from "@/components/reel-cover-maker/paint";
import { DEFAULT_ADJUST, DEFAULT_FRAME, keptSize, sourceRect } from "@/components/reel-cover-maker/photo";
import { adjustedPhoto } from "@/components/reel-cover-maker/photo-gl";
import { forgetPhoto, loadPhoto, savePhoto } from "@/components/reel-cover-maker/photo-store";
import { PhotoControls } from "@/components/reel-cover-maker/PhotoControls";
import { HOME, invert, isHome, keepOnCover, multiply, placeMatrix, type Matrix, type Place, type Point } from "@/components/reel-cover-maker/place";
import { paletteFor, standsOut, type Ground } from "@/components/reel-cover-maker/palettes";
import { fileName, FILE_TYPE, isAndroid, isInAppBrowser, saveMethod, type SaveMethod } from "@/components/reel-cover-maker/save";
import { drawLayers, layerFailed, layerReady, layersVersion, liquidLayer, subscribeLayers } from "@/components/reel-cover-maker/liquid-client";
import type { LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import {
  buildScene,
  isBackdrop,
  LETTERINGS,
  letteringFace,
  liquidOps,
  PASTY_LETTERINGS,
  placeScene,
  STYLES,
  type CoverInput,
  type Scene,
} from "@/components/reel-cover-maker/scene";
import { TextField } from "@/components/reel-cover-maker/TextField";
import { applyBackdrop, clearBackdrop } from "@/components/reel-cover-maker/theme";
import { hasTitle, MAX_TITLE_LENGTH, PLACEHOLDER_TITLE } from "@/components/reel-cover-maker/title";

/**
 * How long the picture must stay as it is before its file is made ready to
 * hand over: typing, or a slider being dragged, makes a new picture every
 * moment, and encoding each one would only slow the drag.
 */
const PREPARE_DELAY_MS = 250;

/** A style thumbnail's width in canvas pixels: twice its widest on screen, for sharp text on a retina screen. */
const THUMB_WIDTH = 240;

const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/** The type a style sets its words in where it offers no choice of lettering, shown where the choice would be. */
const FIXED_FACES: Record<"editorial" | "echo" | "mono", { face: FaceId; name: string }> = {
  editorial: { face: "serif", name: "Instrument Serif" },
  echo: { face: "wide", name: "Archivo Black" },
  mono: { face: "mono", name: "Space Mono" },
};

/** The longest side a photo is kept at: sharp at a reel cover's size zoomed in twice, without holding a phone camera's 48 megapixels. */
const PHOTO_SIDE = 2560;

/** The photo behind the cover, decoded and kept at `PHOTO_SIDE`, with a small picture of it for the panel. */
interface Photo {
  image: HTMLCanvasElement;
  w: number;
  h: number;
  thumb: string;
  /** Changes with every photo, so a canvas knows it must paint again. */
  id: number;
}

let photoCount = 0;

/**
 * A photo file read and kept: turned as the camera held it (its EXIF
 * orientation), its longer side brought down to `PHOTO_SIDE`. Null for a
 * file the browser cannot open (a HEIC on a computer that cannot read one).
 */
async function decodePhoto(file: Blob): Promise<Photo | null> {
  let source: ImageBitmap | HTMLImageElement;
  let url: string | null = null;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
    } catch {
      if (url) URL.revokeObjectURL(url);
      return null;
    }
  }
  const [w0, h0] = source instanceof HTMLImageElement ? [source.naturalWidth, source.naturalHeight] : [source.width, source.height];
  if (!w0 || !h0) return null;
  const { w, h } = keptSize(w0, h0, PHOTO_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  if (source instanceof ImageBitmap) source.close();
  if (url) URL.revokeObjectURL(url);
  const small = keptSize(w, h, 640);
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = small.w;
  thumbCanvas.height = small.h;
  thumbCanvas.getContext("2d")?.drawImage(canvas, 0, 0, small.w, small.h);
  photoCount += 1;
  return { image: canvas, w, h, thumb: thumbCanvas.toDataURL("image/jpeg", 0.85), id: photoCount };
}

/** Whether a drag over the page carries files, which it may be dropping as the photo. */
function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return !!event.dataTransfer && [...event.dataTransfer.types].includes("Files");
}

let grainTile: HTMLCanvasElement | null = null;

/** The grain, made once and kept: the same tile under every cover. */
function grain(): HTMLCanvasElement | null {
  if (grainTile) return grainTile;
  const canvas = document.createElement("canvas");
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(grainPixels(), GRAIN_TILE, GRAIN_TILE), 0, 0);
  grainTile = canvas;
  return canvas;
}

/** Scenes already built, by what they are of: typing rebuilds only what changed. */
const scenes = new Map<string, Scene>();

function sceneFor(input: CoverInput, loads: number): Scene {
  const key = JSON.stringify([input.title, input.style, input.lettering, input.plainFace, input.pastyLettering, input.hue, input.shade, input.ground, input.format, input.seed, input.photo, loads]);
  let scene = scenes.get(key);
  if (!scene) {
    scene = buildScene(input, measurerFor(loads));
    scenes.set(key, scene);
    while (scenes.size > 64) scenes.delete(scenes.keys().next().value as string);
  }
  return scene;
}

/** Each scene's letters as last placed: placing makes the paste's beads again, so it is done once a placement. */
const placedScenes = new WeakMap<Scene, { key: string; scene: Scene }>();

function placed(base: Scene, place: Place): Scene {
  if (isHome(place)) return base;
  const key = JSON.stringify(place);
  const hit = placedScenes.get(base);
  if (hit && hit.key === key) return hit.scene;
  const scene = placeScene(base, place);
  placedScenes.set(base, { key, scene });
  return scene;
}

let shareFiles: boolean | null = null;

/** Whether this browser can hand a PNG to the system's share sheet. Asked once. */
function canShareFiles(): boolean {
  if (shareFiles !== null) return shareFiles;
  try {
    const probe = new File([new Uint8Array(8)], "cover.png", { type: FILE_TYPE });
    shareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    shareFiles = false;
  }
  return shareFiles;
}

function subscribeTouch(listener: () => void): () => void {
  const media = window.matchMedia(TOUCH_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function currentSaveMethod(): SaveMethod {
  return saveMethod({
    canShareFiles: canShareFiles(),
    touch: window.matchMedia(TOUCH_QUERY).matches,
    android: isAndroid(navigator.userAgent),
    inAppBrowser: isInAppBrowser(navigator.userAgent),
  });
}

function canvasFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], name, { type: FILE_TYPE }));
      else reject(new Error("The canvas made no picture."));
    }, FILE_TYPE);
  });
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari reads the file after the click returns; give it time before letting go.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** The part of the picture the profile grid shows, or all of it. */
function gridWindow(format: Format) {
  return format.grid ?? { x: 0, y: 0, w: format.width, h: format.height };
}

/** The canvas a scene is drawn on at its own size: the preview's, and the download's. */
function fullSize(scene: Scene): LiquidTarget {
  return { width: scene.width, height: scene.height, scale: 1, origin: { x: 0, y: 0 } };
}

/** The liquid layers of a scene for a canvas: whether every one is drawn, and whether any could not be. */
function layersFor(scene: Scene | null, target: LiquidTarget | null) {
  if (!scene || !target) return { ops: [], ready: false, failed: false };
  const ops = liquidOps(scene);
  return {
    ops,
    ready: ops.every((op) => layerReady(op, target)),
    failed: ops.some((op) => layerFailed(op, target)),
  };
}

/** A style's swatch: the title in that style, as the profile grid would show it. */
function Thumb({ scene, format, slot, photoFor }: { scene: Scene | null; format: Format; slot: string; photoFor: (scene: Scene) => PaintOptions["photo"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Drawn again when a liquid layer it waits on arrives.
  useSyncExternalStore(subscribeLayers, layersVersion, () => 0);
  const window = gridWindow(format);
  const scale = THUMB_WIDTH / window.w;
  const height = Math.round(window.h * scale);
  const target: LiquidTarget = { width: THUMB_WIDTH, height, scale, origin: { x: window.x, y: window.y } };
  const { ops, ready } = layersFor(scene, target);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !scene) return;
    // Asked every time: what this canvas shows is kept, what it waits on is drawn.
    drawLayers(ops, target, slot);
    if (!ready) return;
    if (canvas.width !== THUMB_WIDTH) canvas.width = THUMB_WIDTH;
    if (canvas.height !== target.height) canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, scene, { scale, origin: target.origin, font: fontCss, grain: null, liquid: (op, part) => liquidLayer(op, target, part) ?? null, photo: photoFor(scene) });
  });
  return <canvas ref={ref} className={styles.thumbCanvas} width={THUMB_WIDTH} height={320} aria-hidden="true" />;
}

/** The grid's window on the preview, everything outside it dimmed. */
function GridMask({ format }: { format: Format }) {
  if (!format.grid) return null;
  const { x, y, w, h } = format.grid;
  const percent = (value: number, of: number) => `${(value / of) * 100}%`;
  return (
    <div className={styles.mask} aria-hidden="true">
      <div
        className={styles.window}
        style={{
          left: percent(x, format.width),
          top: percent(y, format.height),
          width: percent(w, format.width),
          height: percent(h, format.height),
        }}
      />
    </div>
  );
}

export default function ReelCoverMaker() {
  const [design, setDesign] = useState<Design>(loadDesign);
  /** The design as last set, for a change made from a callback that began before it (a photo still loading). */
  const designRef = useRef(design);
  const historyRef = useRef<History<Design>>(emptyHistory());
  /** How many steps there are to undo and to redo, for the buttons. */
  const [steps, setSteps] = useState({ back: 0, forward: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  /** Whether the photo kept from last time has been looked for: the cover waits for it, so it never flashes up without it. */
  const [photoChecked, setPhotoChecked] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  /** A file is being dragged over the preview. */
  const [dropping, setDropping] = useState(false);
  /** The letters are selected on the cover, their box and handles showing. */
  const [selected, setSelected] = useState(false);
  /** Moves when a gesture is called off, so the picture as it was is painted again. */
  const [repaint, setRepaint] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLDialogElement>(null);
  const prepared = useRef<{ key: string; file: File } | null>(null);
  /** What is on the canvas. */
  const painted = useRef<string | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const takePhotoRef = useRef<(file: Blob) => void>(() => {});
  const photoForRef = useRef<(scene: Scene) => PaintOptions["photo"]>(() => null);
  /** The letters as they were drawn when a gesture began, carried with it until they are drawn again where it left them. */
  const liveRef = useRef<{ layer: HTMLCanvasElement; shadow: HTMLCanvasElement | null; from: Matrix } | null>(null);
  const interimRef = useRef<() => void>(() => {});
  const surfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** The letters alone, drawn once a picture, to tell a press on them from one between them. */
  const inkRef = useRef<{ key: string; ctx: CanvasRenderingContext2D } | null>(null);

  const filled = hasTitle(design.text);
  const title = filled ? design.text : PLACEHOLDER_TITLE;
  const format = formatById(design.format);

  const faces = facesFor(design.plainFace, letteringFace(design.lettering));
  const loads = useSyncExternalStore(subscribeFonts, () => fontsSnapshot(title, faces), () => -1);
  const method = useSyncExternalStore<SaveMethod>(subscribeTouch, currentSaveMethod, () => "download");

  const measurer = loads >= 0 ? measurerFor(loads) : null;
  const input: CoverInput = {
    title,
    style: design.style,
    lettering: design.lettering,
    plainFace: design.plainFace,
    pastyLettering: design.pastyLettering,
    hue: design.hue,
    shade: design.shade,
    ground: design.ground,
    format: design.format,
    seed: design.seed,
    photo: photo !== null,
  };
  const base = measurer ? sceneFor(input, loads) : null;
  /** Where the letters are, kept on the cover whatever its size now. */
  const place = base ? keepOnCover(base.readable, design.place, { w: base.width, h: base.height }) : design.place;
  const scene = base ? placed(base, place) : null;
  const thumbs = measurer ? STYLES.map((style) => placed(sceneFor({ ...input, style: style.id }, loads), place)) : null;
  const name = fileName(design.text, design.format);
  // Drawn again when a liquid layer the preview waits on arrives.
  useSyncExternalStore(subscribeLayers, layersVersion, () => 0);
  const layers = layersFor(scene, scene && fullSize(scene));
  /** The whole picture can be drawn now: no liquid layer of it is still being drawn, none failed, and the photo is in. */
  const pictureReady = layers.ready && !layers.failed && photoChecked;
  /** What the drawn picture is of; a prepared file is handed over only if it is of the same. */
  const key = JSON.stringify([
    design.text,
    design.style,
    design.lettering,
    design.plainFace,
    design.pastyLettering,
    design.hue,
    design.shade,
    design.ground,
    design.format,
    design.seed,
    loads,
    photo?.id ?? 0,
    design.photoFrame,
    design.photoAdjust,
    place,
  ]);

  const show = (next: Design) => {
    designRef.current = next;
    saveDesign(next);
    setDesign(next);
    setSteps({ back: historyRef.current.past.length, forward: historyRef.current.future.length });
    setError(null);
  };

  /** A change to the design: a step to undo, unless it is one undo cannot mean (a new photo framed whole). */
  const update = (change: Partial<Design>, step = true) => {
    const current = designRef.current;
    historyRef.current = step ? record(historyRef.current, current, Object.keys(change), performance.now()) : seal(historyRef.current);
    show({ ...current, ...change });
  };

  const undo = () => {
    const back = undoStep(historyRef.current, designRef.current);
    if (!back) return;
    historyRef.current = back.history;
    setSelected(false);
    show(back.state);
  };

  const redo = () => {
    const forward = redoStep(historyRef.current, designRef.current);
    if (!forward) return;
    historyRef.current = forward.history;
    setSelected(false);
    show(forward.state);
  };

  /** The photo as a canvas paints it, framed for the scene's size and adjusted; null with no photo. */
  const photoFor = (s: Scene): PaintOptions["photo"] => {
    if (!photo) return null;
    const frame = design.photoFrame;
    return { image: adjustedPhoto(photo.image, photo.w, photo.h, design.photoAdjust), ...sourceRect(photo.w, photo.h, s.width, s.height, frame), flip: frame.flip };
  };

  /** A file chosen, taken or dropped, as the new photo, framed whole and unadjusted; kept for next time. */
  const takePhoto = async (file: Blob) => {
    setError(null);
    const made = await decodePhoto(file);
    if (!made) {
      setError("That picture could not be opened. Try a JPEG or a PNG.");
      return;
    }
    setPhoto(made);
    update({ photoFrame: DEFAULT_FRAME, photoAdjust: DEFAULT_ADJUST }, false);
    made.image.toBlob((blob) => {
      if (blob) void savePhoto(blob);
    }, "image/jpeg", 0.92);
  };

  const removePhoto = () => {
    setPhoto(null);
    void forgetPhoto();
    update({ photoFrame: DEFAULT_FRAME, photoAdjust: DEFAULT_ADJUST }, false);
  };

  /** The computer's camera, opened here; false on a phone (or with no camera to ask for), where the file field's own camera serves. */
  const openCamera = () => {
    if (window.matchMedia(TOUCH_QUERY).matches || !navigator.mediaDevices?.getUserMedia) return false;
    setCameraOpen(true);
    return true;
  };

  /** Another draw of every random choice: a new seed, never the one showing. */
  const shuffle = () => {
    let seed = design.seed;
    while (seed === design.seed) seed = Math.floor(Math.random() * 2 ** 30) + 1;
    update({ seed });
  };

  const plainFace = design.plainFace;
  const funkyFace = letteringFace(design.lettering);
  useEffect(() => requestFonts(title, facesFor(plainFace, funkyFace)), [title, plainFace, funkyFace]);

  // The page and the browser's bars in the maker's light or dark, handed back on the way out.
  useEffect(() => {
    applyBackdrop();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyBackdrop);
    window.addEventListener("load", applyBackdrop);
    return () => {
      media.removeEventListener("change", applyBackdrop);
      window.removeEventListener("load", applyBackdrop);
      clearBackdrop();
    };
  }, []);

  // The styles are one row, scrolled sideways: a mouse's wheel, which only
  // turns up and down, scrolls it too while it can go further, then lets
  // the page have the wheel back.
  useEffect(() => {
    const row = stylesRef.current;
    if (!row) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const most = row.scrollWidth - row.clientWidth;
      const step = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1);
      if (most <= 0 || (step < 0 && row.scrollLeft <= 0) || (step > 0 && row.scrollLeft >= most - 1)) return;
      event.preventDefault();
      row.scrollLeft = Math.max(0, Math.min(most, row.scrollLeft + step));
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  // The chosen style kept in sight along its row, however it was chosen.
  useEffect(() => {
    const row = stylesRef.current;
    const chosen = row?.querySelector<HTMLElement>("[data-chosen]");
    if (!row || !chosen) return;
    const r = row.getBoundingClientRect();
    const c = chosen.getBoundingClientRect();
    if (c.left < r.left) row.scrollBy({ left: c.left - r.left - 16 });
    else if (c.right > r.right) row.scrollBy({ left: c.right - r.right + 16 });
  }, [design.style]);

  // The photo kept from last time, read back before the cover is first drawn.
  useEffect(() => {
    let gone = false;
    void loadPhoto().then(async (blob) => {
      const made = blob ? await decodePhoto(blob) : null;
      if (gone) return;
      if (made) setPhoto(made);
      setPhotoChecked(true);
    });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    takePhotoRef.current = (file) => void takePhoto(file);
  });

  // A picture pasted anywhere on the page is taken as the photo; pasted text goes where it always went.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      takePhotoRef.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // A computer is here to type; a phone's keyboard should wait to be asked for.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  /**
   * The letters drawn at a placement while a gesture runs: the picture under
   * them painted as it is, and the letters as they were drawn when it began,
   * carried by the difference. Fast enough for every move; they are drawn
   * again sharp, and the paste made again, once the gesture ends.
   */
  const showLive = (next: Place) => {
    const canvas = canvasRef.current;
    if (!canvas || !base || !scene || !canvas.width) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const target = fullSize(scene);
    const options: PaintOptions = { scale: 1, font: fontCss, grain: grain(), liquid: (op, part) => liquidLayer(op, target, part) ?? null, photo: photoForRef.current(scene) };
    if (!liveRef.current) {
      const layerOf = (draw: (layerCtx: CanvasRenderingContext2D) => void) => {
        const layer = document.createElement("canvas");
        layer.width = canvas.width;
        layer.height = canvas.height;
        const layerCtx = layer.getContext("2d");
        if (!layerCtx) return null;
        draw(layerCtx);
        return layer;
      };
      // The letters on nothing; and the shadow paste casts on a photo apart, white where none falls, to multiply as it was drawn.
      const layer = layerOf((layerCtx) => paint(layerCtx, { ...scene, ops: scene.ops.filter((op) => !isBackdrop(op)) }, { ...options, liquid: (op, part) => (part === "shadow" ? null : options.liquid?.(op, part) ?? null) }));
      const casting = liquidOps(scene).filter((op) => op.shadow);
      const shadow = casting.length
        ? layerOf((layerCtx) => {
            layerCtx.fillStyle = "#ffffff";
            layerCtx.fillRect(0, 0, canvas.width, canvas.height);
            paint(layerCtx, { ...scene, ops: casting }, { ...options, liquid: (op, part) => (part === "shadow" ? options.liquid?.(op, part) ?? null : null) });
          })
        : null;
      if (!layer) return;
      liveRef.current = { layer, shadow, from: placeMatrix(base.readable, place) };
    }
    paint(ctx, { ...scene, ops: scene.ops.filter(isBackdrop) }, options);
    const d = multiply(placeMatrix(base.readable, next), invert(liveRef.current.from));
    ctx.save();
    ctx.setTransform(d[0], d[1], d[2], d[3], d[4], d[5]);
    if (liveRef.current.shadow) {
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(liveRef.current.shadow, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(liveRef.current.layer, 0, 0);
    ctx.restore();
    painted.current = null;
  };

  /** Whether any of the letters is drawn within `reach` of a point of the picture; yes until the picture is drawn. */
  const inkAt = (p: Point, reach: number): boolean => {
    if (!scene || painted.current !== key) return true;
    if (inkRef.current?.key !== key) {
      const canvas = inkRef.current?.ctx.canvas ?? document.createElement("canvas");
      canvas.width = scene.width;
      canvas.height = scene.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return true;
      const target = fullSize(scene);
      paint(ctx, { ...scene, ops: scene.ops.filter((op) => !isBackdrop(op)) }, { scale: 1, font: fontCss, grain: null, liquid: (op, part) => (part === "shadow" ? null : liquidLayer(op, target, part) ?? null), photo: null });
      inkRef.current = { key, ctx };
    }
    const { ctx } = inkRef.current;
    const r = Math.max(1, Math.round(reach));
    const x0 = Math.max(0, Math.round(p.x) - r);
    const y0 = Math.max(0, Math.round(p.y) - r);
    const x1 = Math.min(scene.width, Math.round(p.x) + r + 1);
    const y1 = Math.min(scene.height, Math.round(p.y) + r + 1);
    if (x1 <= x0 || y1 <= y0) return false;
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 24) return true;
    return false;
  };

  // What the drawing below reads at the time it draws; the key it draws under already names the photo, its frame and its adjustments, and the placement.
  useEffect(() => {
    photoForRef.current = photoFor;
    interimRef.current = () => showLive(place);
  });

  // Draw the cover, then make its file, so a tap on Save can share it at
  // once: Safari refuses a share that waits on anything. Only a change to
  // the picture draws again; a render for anything else (the grid crop, the
  // dialog) leaves the canvas alone.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const mainTarget = fullSize(scene);
    // Asked every time: what the preview shows is kept, what it waits on is drawn.
    // The canvas's size is set only here, as it is painted, so the last
    // picture stays up, whole, until this one is ready.
    drawLayers(liquidOps(scene), mainTarget, "main");
    if (!pictureReady) {
      // Moved letters wait for their paste to be made again where they now are: until then, carried there from where they were.
      if (liveRef.current) interimRef.current();
      return;
    }
    if (painted.current !== key) {
      if (canvas.width !== scene.width) canvas.width = scene.width;
      if (canvas.height !== scene.height) canvas.height = scene.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paint(ctx, scene, { scale: 1, font: fontCss, grain: grain(), liquid: (op, part) => liquidLayer(op, mainTarget, part) ?? null, photo: photoForRef.current(scene) });
      painted.current = key;
      liveRef.current = null;
    }
    if (prepared.current?.key === key) return;
    // The file waits for the picture to settle; the first one is made at once.
    const first = prepared.current === null;
    const timer = window.setTimeout(
      () => {
        canvasFile(canvas, name).then(
          (file) => {
            if (painted.current === key) prepared.current = { key, file };
          },
          () => {},
        );
      },
      first ? 0 : PREPARE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [scene, name, key, pictureReady, repaint]);

  useEffect(() => {
    const dialog = holdRef.current;
    if (held && dialog && !dialog.open) dialog.showModal();
  }, [held]);

  const save = async () => {
    const canvas = canvasRef.current;
    // Never the last picture: only once this one is on the canvas.
    if (!canvas || !scene || !filled || painted.current !== key) return;
    setError(null);
    const ready = prepared.current?.key === key ? prepared.current.file : null;
    try {
      const file = ready ?? (await canvasFile(canvas, name));
      if (method === "share") {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (shareError) {
          if (isAbort(shareError)) return;
          // Refused (the tap was too long ago, or the sheet is not allowed here): hold to save instead.
          setHeld(await dataUrl(file));
          return;
        }
      }
      if (method === "hold") {
        setHeld(await dataUrl(file));
        return;
      }
      download(file);
    } catch {
      setError("The picture could not be made. Try again.");
    }
  };

  useEffect(() => {
    saveRef.current = () => void save();
    undoRef.current = undo;
    redoRef.current = redo;
  });

  // Cmd or Ctrl and S saves the cover rather than the page; Z undoes (with Shift, redoes, as Ctrl and Y does), in the Text field too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if ((event.code === "KeyS" || key === "s") && !event.shiftKey) {
        event.preventDefault();
        saveRef.current();
      } else if (event.code === "KeyZ" || key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoRef.current();
        else undoRef.current();
      } else if ((event.code === "KeyY" || key === "y") && event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lowContrast = design.style !== "stickery" && !photo && !standsOut(paletteFor(design));
  const frameStyle = { "--rcm-ratio": `${format.width} / ${format.height}`, "--rcm-ratio-n": format.width / format.height } as CSSProperties;
  const saveLabel = method === "share" ? "Save image" : "Download";

  return (
    <main className={`${styles.root} ${interTight.variable}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{APP_NAME}</h1>
        <div className={styles.actions}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className={styles.save}
            onClick={() => void save()}
            disabled={!scene || !filled || !pictureReady}
            aria-busy={filled && !pictureReady}
            title={filled ? `PNG, ${format.width} by ${format.height}` : "Type a title first"}
          >
            <DownloadSimple size={18} weight="bold" aria-hidden="true" />
            {saveLabel}
          </button>
        </div>
      </header>

      <div className={styles.main}>
        <div className={styles.panel}>
          <TextField
            id="rcm-title"
            value={design.text}
            onChange={(text) => update({ text })}
            onUndo={() => undoRef.current()}
            onRedo={() => redoRef.current()}
            inputRef={inputRef}
            placeholder={PLACEHOLDER_TITLE}
            maxLength={MAX_TITLE_LENGTH}
            side={
              <button type="button" className={styles.toggle} onClick={shuffle} title="Draw the letters another way">
                <Shuffle size={16} weight="bold" aria-hidden="true" />
                Shuffle
              </button>
            }
          >
            {scene?.truncated && <p className={styles.note}>Too long for the cover: the end is cut.</p>}
            {layers.failed && <p className={styles.note}>This style could not be drawn here. Try another.</p>}
          </TextField>

          {/* The style's own type: one row, the same height for every style, so nothing under it moves when another is picked. */}
          <div className={styles.letteringRow}>
            {design.style === "stickery" ? (
              <>
                <Dropdown
                  label="Lettering"
                  value={design.lettering}
                  options={LETTERINGS.filter((l) => l.chosen || l.id === design.lettering).map((l) => ({
                    value: l.id,
                    label: l.name,
                    font: l.face ? fontCss(l.face, 19) : undefined,
                  }))}
                  onChange={(lettering) => update({ lettering })}
                />
                <Dropdown
                  label="Plain words"
                  value={design.plainFace}
                  options={PLAIN_FACES.filter((f) => f.offered || f.id === design.plainFace).map((f) => ({
                    value: f.id,
                    label: f.name,
                    font: fontCss(f.id, 16),
                  }))}
                  onChange={(plainFace) => update({ plainFace })}
                />
              </>
            ) : design.style === "pasty" || design.style === "pasty-flat" ? (
              <Dropdown
                label="Lettering"
                value={design.pastyLettering}
                options={PASTY_LETTERINGS.map((l) => ({ value: l.id, label: l.name }))}
                onChange={(pastyLettering) => update({ pastyLettering })}
              />
            ) : (
              <div className={styles.dropdown}>
                <span className={styles.label} id="rcm-fixed-face">
                  Lettering
                </span>
                {/* Set by the style, not chosen: shown in its own type, as a fact. */}
                <span className={styles.fixedFace} aria-labelledby="rcm-fixed-face" style={{ font: fontCss(FIXED_FACES[design.style].face, 17) }}>
                  {FIXED_FACES[design.style].name}
                </span>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label} id="rcm-colour-label">
                Colour
              </span>
              <span className={styles.colourSide}>
                {/* Said beside the colour, not under it, so nothing below moves when it is said. */}
                {lowContrast && (
                  <span className={styles.warnPill} title="The letters are close to the background in lightness, and may blur once Instagram compresses the cover">
                    Low contrast
                  </span>
                )}
                <span className={styles.chip} style={{ background: sliderColour(design.hue, design.shade) }} aria-hidden="true" />
              </span>
            </div>
            <div className={styles.sliders} role="group" aria-labelledby="rcm-colour-label">
              <input
                type="range"
                className={styles.slider}
                style={{ "--rcm-track": hueTrack(design.shade) } as CSSProperties}
                min={0}
                max={360}
                step={1}
                value={Math.round(design.hue)}
                onChange={(event) => update({ hue: Number(event.target.value) })}
                aria-label="Hue"
              />
              <input
                type="range"
                className={styles.slider}
                style={{ "--rcm-track": shadeTrack(design.hue) } as CSSProperties}
                min={0}
                max={1}
                step={0.01}
                value={design.shade}
                onChange={(event) => update({ shade: Number(event.target.value) })}
                aria-label="Shade"
              />
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label} id="rcm-format-label">
                Size <span className={styles.dims}>{format.width} × {format.height}</span>
              </span>
              <label className={styles.check} title={format.grid ? "Dim what the profile grid cuts off" : "The profile grid shows a 3:4 post whole"}>
                <input
                  type="checkbox"
                  className={styles.radio}
                  checked={showGrid && !!format.grid}
                  disabled={!format.grid}
                  onChange={(event) => setShowGrid(event.target.checked)}
                />
                <span className={styles.checkBox} aria-hidden="true">
                  <Check size={12} weight="bold" />
                </span>
                Grid crop
              </label>
            </div>
            <div className={styles.segments} role="radiogroup" aria-labelledby="rcm-format-label">
              {FORMATS.map((f) => (
                <label key={f.id} className={styles.segment}>
                  <input
                    type="radio"
                    name="rcm-format"
                    className={styles.radio}
                    checked={design.format === f.id}
                    onChange={() => update({ format: f.id })}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <section
          className={styles.preview}
          aria-label="Preview"
          onDragOver={(event) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={(event) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            setDropping(false);
            const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
            if (file) void takePhoto(file);
          }}
        >
          <div className={styles.previewTop}>
            <div className={styles.history}>
              <button type="button" className={styles.iconButton} onClick={undo} disabled={steps.back === 0} aria-label="Undo" title="Undo">
                <ArrowUUpLeft size={17} weight="bold" />
              </button>
              <button type="button" className={styles.iconButton} onClick={redo} disabled={steps.forward === 0} aria-label="Redo" title="Redo">
                <ArrowUUpRight size={17} weight="bold" />
              </button>
            </div>
            {!isHome(place) && (
              <button type="button" className={`${styles.toggle} ${styles.resetText}`} onClick={() => update({ place: HOME })} title="Put the text back where the style sets it" aria-label="Reset text">
                <ArrowCounterClockwise size={15} weight="bold" aria-hidden="true" />
                <span className={styles.resetLabel}>Reset text</span>
              </button>
            )}
            <div className={`${styles.segments} ${styles.compact}`} role="radiogroup" aria-label="Background">
              {(["light", "dark"] as const satisfies readonly Ground[]).map((ground) => (
                <label key={ground} className={styles.segment}>
                  <input
                    type="radio"
                    name="rcm-ground"
                    className={styles.radio}
                    checked={design.ground === ground}
                    onChange={() => update({ ground })}
                  />
                  {ground === "light" ? <Sun size={15} weight="bold" aria-hidden="true" /> : <Moon size={15} weight="bold" aria-hidden="true" />}
                  {ground === "light" ? "Light" : "Dark"}
                </label>
              ))}
            </div>
          </div>
          <div className={styles.stage} ref={stageRef}>
            <div className={styles.frame} style={frameStyle}>
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                role="img"
                aria-label={`${format.label} preview`}
              />

              {showGrid && <GridMask format={format} />}
              {scene && base && (
                <CoverSurface
                  surfaceRef={surfaceRef}
                  width={scene.width}
                  height={scene.height}
                  box={base.readable.w > 0 && base.readable.h > 0 ? base.readable : null}
                  place={place}
                  onPlace={(next) => update({ place: next })}
                  onLive={(next) => (next ? showLive(next) : setRepaint((n) => n + 1))}
                  selected={selected}
                  onSelect={setSelected}
                  photo={photo}
                  frame={design.photoFrame}
                  onFrame={(photoFrame) => update({ photoFrame })}
                  onEditText={() => inputRef.current?.focus()}
                  inkAt={inkAt}
                  clipRef={stageRef}
                />
              )}
              {dropping && (
                <div className={styles.dropHint} aria-hidden="true">
                  Drop to use as the photo
                </div>
              )}
            </div>
          </div>

          <div ref={stylesRef} className={styles.styles} role="radiogroup" aria-label="Style">
            {STYLES.map((style, i) => (
              <label key={style.id} className={styles.style} data-chosen={design.style === style.id || undefined}>
                <input
                  type="radio"
                  name="rcm-style"
                  className={styles.radio}
                  checked={design.style === style.id}
                  onChange={() => update({ style: style.id })}
                />
                <span className={styles.thumb}>
                  <Thumb scene={thumbs?.[i] ?? null} format={format} slot={`thumb-${style.id}`} photoFor={photoFor} />
                </span>
                <span className={styles.styleName}>{style.name}</span>
              </label>
            ))}
          </div>
        </section>

        <PhotoControls
          thumb={photo?.thumb ?? null}
          frame={design.photoFrame}
          adjust={design.photoAdjust}
          onFile={(file) => void takePhoto(file)}
          onCamera={openCamera}
          onRemove={removePhoto}
          onFrame={(photoFrame) => update({ photoFrame })}
          onAdjust={(photoAdjust) => update({ photoAdjust })}
        />
      </div>

      {cameraOpen && (
        <Camera
          onCapture={(file) => {
            setCameraOpen(false);
            void takePhoto(file);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      <dialog ref={holdRef} className={styles.dialog} onClose={() => setHeld(null)} aria-label="Save the cover">
        {held && (
          // A data URL of the cover, to be pressed and held: next/image has nothing to add to it.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.held} src={held} alt="The cover" />
        )}
        <p className={styles.holdText}>Press and hold the picture to save it.</p>
        <button type="button" className={styles.save} onClick={() => holdRef.current?.close()}>
          Done
        </button>
      </dialog>
    </main>
  );
}
