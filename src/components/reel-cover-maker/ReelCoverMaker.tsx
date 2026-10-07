"use client";

import { ArrowCounterClockwise, ArrowUUpLeft, ArrowUUpRight, Check, DeviceMobile, DownloadSimple, Moon, Shuffle, Sparkle, Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { sliderColour } from "@/components/reel-cover-maker/colour";
import { ColourSliders, HexChip, TextColourField } from "@/components/reel-cover-maker/ColourField";
import { AnimateCard } from "@/components/reel-cover-maker/AnimateCard";
import { animationsFor, frameTimes, holdFrames, plan as animationPlan, type AnimationId, type Plan } from "@/components/reel-cover-maker/animate";
import { drawFrames, pngOf } from "@/components/reel-cover-maker/animation-frames";
import icon from "@/app/icon.svg";
import { Camera } from "@/components/reel-cover-maker/Camera";
import { CoverSurface } from "@/components/reel-cover-maker/CoverSurface";
import { animationOf, loadDesign, saveDesign, type Design } from "@/components/reel-cover-maker/design";
import { Dropdown } from "@/components/reel-cover-maker/Dropdown";
import { PLAIN_FACES, type FaceId, type Measurer } from "@/components/reel-cover-maker/faces";
import { facesFor, fontCss, fontsSnapshot, interTight, measurerFor, requestFonts, subscribeFonts } from "@/components/reel-cover-maker/fonts";
import { FORMATS, formatById, type Format } from "@/components/reel-cover-maker/formats";
import { GRAIN_TILE, grainPixels } from "@/components/reel-cover-maker/grain";
import { emptyHistory, record, redo as redoStep, seal, undo as undoStep, type History } from "@/components/reel-cover-maker/history";
import { APP_NAME } from "@/components/reel-cover-maker/meta";
import { paint, type PaintOptions } from "@/components/reel-cover-maker/paint";
import { tilePixels } from "@/components/reel-cover-maker/phone";
import { DEFAULT_ADJUST, DEFAULT_FRAME, keptSize, sourceRect } from "@/components/reel-cover-maker/photo";
import { adjustedPhoto } from "@/components/reel-cover-maker/photo-gl";
import { forgetPhoto, loadPhoto, savePhoto } from "@/components/reel-cover-maker/photo-store";
import { MotionCanvas, PLAY_FPS, useMotion, type MotionRequest } from "@/components/reel-cover-maker/Motion";
import { PhoneView } from "@/components/reel-cover-maker/PhoneView";
import { PhotoControls } from "@/components/reel-cover-maker/PhotoControls";
import { HOME, invert, isHome, keepOnCover, multiply, placeMatrix, type Matrix, type Place, type Point } from "@/components/reel-cover-maker/place";
import { textColour, type TextMode } from "@/components/reel-cover-maker/palettes";
import { isApple, subscribeNothing } from "@/components/reel-cover-maker/platform";
import { fileName, FILE_TYPE, isAndroid, isInAppBrowser, saveMethod, videoName, type SaveMethod } from "@/components/reel-cover-maker/save";
import { VIDEO_FPS, videoMaker, type VideoKind } from "@/components/reel-cover-maker/video";
import { drawLayers, layerFailed, layerReady, layersVersion, liquidLayer, subscribeLayers, type LiquidLayer } from "@/components/reel-cover-maker/liquid-client";
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
import { Shortcuts } from "@/components/reel-cover-maker/Shortcuts";
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

/**
 * How much smaller the preview's quick draft of its paste is made, to show
 * while its own is still being made: a quarter of the pixels, so about a
 * quarter of the time, and on screen, where the cover is shown at about
 * half its size, hard to tell from the real one.
 */
const DRAFT_SCALE = 0.5;

/** How long the picture must have been ready before every other style is made ahead of time. */
const AHEAD_DELAY_MS = 120;

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
  // The text colour is Stickery's alone: picking one builds no other style again.
  const text = input.style === "stickery" ? input.textColour ?? null : null;
  const key = JSON.stringify([input.title, input.style, input.lettering, input.plainFace, input.pastyLettering, input.hue, input.shade, input.ground, text, input.format, input.seed, input.photo, loads]);
  let scene = scenes.get(key);
  if (!scene) {
    scene = buildScene(input, measurerFor(loads));
    scenes.set(key, scene);
    while (scenes.size > 64) scenes.delete(scenes.keys().next().value as string);
  }
  return scene;
}

/** Each scene's animations as planned: planning walks the scene, so it is done once a scene. */
const plans = new WeakMap<Scene, Map<AnimationId, Plan>>();

function planFor(scene: Scene, style: Design["style"], id: AnimationId, measurer: Measurer): Plan {
  let byId = plans.get(scene);
  if (!byId) {
    byId = new Map();
    plans.set(scene, byId);
  }
  let made = byId.get(id);
  if (!made) {
    made = animationPlan(scene, style, id, measurer);
    byId.set(id, made);
  }
  return made;
}

/** The most a playing animation may hold, in bytes: every frame is kept as a picture. */
const MOTION_BUDGET = 110 * 1024 * 1024;

/** How soon after a video is begun a press on its button stops it: sooner is a double click's second half. */
const STOP_AFTER_MS = 800;

/** A tile's width in the Animate card, in canvas pixels: half again its size on screen, sharp enough while it moves. */
const CARD_WIDTH = 270;

/** A playing animation's width, in canvas pixels: as sharp as the preview shows it, within the budget for all its frames. */
function motionWidth(shown: number, format: Format, duration: number): number {
  const frames = Math.ceil(duration * PLAY_FPS) + 1;
  const most = Math.sqrt(MOTION_BUDGET / (4 * frames * (format.height / format.width)));
  return Math.max(160, Math.round(Math.min(shown, 720, most)));
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

/**
 * A style's cover as the preview draws it: the scene as the style sets it,
 * the placement asked for kept on it, and the scene with its letters there.
 * The thumbnails and the styles made ahead of time are made the same way,
 * so the cover a style shows once picked is the one made ahead for it.
 */
function coverFor(input: CoverInput, loads: number, asked: Place): { base: Scene; place: Place; scene: Scene } {
  const base = sceneFor(input, loads);
  const place = keepOnCover(base.readable, asked, { w: base.width, h: base.height });
  return { base, place, scene: placed(base, place) };
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

/** The canvas a scene is drawn on at its own size: the preview's, and the download's. */
function fullSize(scene: Scene): LiquidTarget {
  return { width: scene.width, height: scene.height, scale: 1, origin: { x: 0, y: 0 } };
}

/** The smaller canvas the preview's quick draft of its paste is made for. */
function draftSize(scene: Scene): LiquidTarget {
  return { width: Math.ceil(scene.width * DRAFT_SCALE), height: Math.ceil(scene.height * DRAFT_SCALE), scale: DRAFT_SCALE, origin: { x: 0, y: 0 } };
}

/** A draft's layer, made for the smaller canvas, as big as it is on the preview. */
function grown(layer: LiquidLayer | null | undefined, scale: number) {
  if (!layer) return null;
  return { ...layer, x: layer.x / scale, y: layer.y / scale, dw: layer.w / scale, dh: layer.h / scale };
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

/** The whole cover, `width` canvas pixels wide: a style's swatch, in the cover's own shape, so nothing of it is cut off at its sides. */
function wholeCover(format: Format, width: number): LiquidTarget {
  const scale = width / format.width;
  return { width, height: Math.round(format.height * scale), scale, origin: { x: 0, y: 0 } };
}

/** The window of the cover the profile grid shows (all of a 3:4 post), `width` canvas pixels wide: the phone view's tile. */
function gridWindow(format: Format, width: number): LiquidTarget {
  const window = format.grid ?? { x: 0, y: 0, w: format.width, h: format.height };
  const scale = width / window.w;
  return { width, height: Math.round(window.h * scale), scale, origin: { x: window.x, y: window.y } };
}

/**
 * A small canvas of a scene, for `target`: a style's thumbnail, or the
 * phone view's tile. Its size is set only where it is painted, so the
 * last picture stays up, whole, until the next is ready.
 */
function SceneCanvas({ scene, target, slot, photoFor }: { scene: Scene | null; target: LiquidTarget; slot: string; photoFor: (scene: Scene) => PaintOptions["photo"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Drawn again when a liquid layer it waits on arrives.
  useSyncExternalStore(subscribeLayers, layersVersion, () => 0);
  const { ops, ready } = layersFor(scene, target);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !scene) return;
    // Asked every time: what this canvas shows is kept, what it waits on is drawn.
    drawLayers(ops, target, slot, "thumb");
    if (!ready) return;
    if (canvas.width !== target.width) canvas.width = target.width;
    if (canvas.height !== target.height) canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, scene, { scale: target.scale, origin: target.origin, font: fontCss, grain: null, liquid: (op, part) => liquidLayer(op, target, part) ?? null, photo: photoFor(scene) });
  });
  return <canvas ref={ref} className={styles.thumbCanvas} aria-hidden="true" />;
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
  /** The cover shown as a phone shows it in the profile grid, in place of the cover to edit. */
  const [phoneView, setPhoneView] = useState(false);
  /** The Animate card is open, to pick how the cover is animated. */
  const [animateOpen, setAnimateOpen] = useState(false);
  /** How far a video being made has got, 0 to 1; null while none is. */
  const [making, setMaking] = useState<number | null>(null);
  const makingRef = useRef<{ controller: AbortController; since: number } | null>(null);
  /** A video made, waiting for a tap to share it: a share must follow a tap at once, and a video takes a while. */
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoRef = useRef<HTMLDialogElement>(null);
  /** The preview's width on screen, in canvas pixels: what a playing animation is drawn at. */
  const [shownWidth, setShownWidth] = useState(480);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
  const aheadRef = useRef<() => void>(() => {});
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
  const apple = useSyncExternalStore(subscribeNothing, isApple, () => true);

  const measurer = loads >= 0 ? measurerFor(loads) : null;
  /** Stickery's letters' colour, as picked; null for auto, each sticker's own black or white. */
  const textHex = textColour(design.textMode, design.textHue, design.textShade);
  const input: CoverInput = {
    title,
    style: design.style,
    lettering: design.lettering,
    plainFace: design.plainFace,
    textColour: textHex,
    pastyLettering: design.pastyLettering,
    hue: design.hue,
    shade: design.shade,
    ground: design.ground,
    format: design.format,
    seed: design.seed,
    photo: photo !== null,
  };
  const cover = measurer ? coverFor(input, loads, design.place) : null;
  const base = cover?.base ?? null;
  /** Where the letters are, kept on the cover whatever its size now. */
  const place = cover?.place ?? design.place;
  const scene = cover?.scene ?? null;
  /** The cover in every style: the thumbnails, and what is made ahead of time for each. */
  const thumbs = measurer ? STYLES.map((style) => (style.id === design.style ? scene : coverFor({ ...input, style: style.id }, loads, design.place).scene)) : null;
  const name = fileName(design.text, design.format);
  // Drawn again when a liquid layer the preview waits on arrives.
  useSyncExternalStore(subscribeLayers, layersVersion, () => 0);
  const layers = layersFor(scene, scene && fullSize(scene));
  /** The whole picture can be drawn now: no liquid layer of it is still being drawn, none failed, and the photo is in. */
  const pictureReady = layers.ready && !layers.failed && photoChecked;
  const draft = layersFor(scene, scene && draftSize(scene));
  /** A quick draft of the picture can be shown while it is made: its paste made smaller, and the photo in. */
  const draftReady = draft.ready && !draft.failed && photoChecked;
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
    design.style === "stickery" ? textHex : null,
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

  const hex = sliderColour(design.hue, design.shade);

  /**
   * A change to the text colour: every part of it named in each, so a
   * press on a resting slider and the drag after it are one step to undo.
   */
  const pickText = (change: { textMode?: TextMode; textHue?: number; textShade?: number }) => {
    const { textMode, textHue, textShade } = designRef.current;
    update({ textMode, textHue, textShade, ...change });
  };

  /** The animation the cover is on, picked or its style's first, whether or not it is animated. */
  const animation = animationOf(design);
  const motionPlan = design.animated && scene && measurer ? planFor(scene, design.style, animation, measurer) : null;
  const motionTarget = motionPlan ? wholeCover(format, motionWidth(shownWidth, format, motionPlan.duration)) : null;
  // Drawn while the letters are not being moved: pressed, they stand still to be placed.
  const motionRequest: MotionRequest | null =
    motionPlan && motionTarget && scene && photoChecked && !selected
      ? {
          key: `${key}|${animation}|${motionTarget.width}`,
          plan: motionPlan,
          setting: () => ({ target: motionTarget, font: fontCss, grain: grain(), photo: photoForRef.current(scene) }),
          slot: "motion-main",
        }
      : null;
  const motion = useMotion(motionRequest);
  /** The animation playing on the preview: only one drawn for the cover as it is now. */
  const playing = motion && motionRequest && motion.key === motionRequest.key ? motion : null;

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
      // The letters on nothing, with a clear cover's shadow stain, which moves with them; and the shadow paste casts on a photo apart, white where none falls, to multiply as it was drawn.
      const layer = layerOf((layerCtx) => paint(layerCtx, { ...scene, ops: scene.ops.filter((op) => !isBackdrop(op)) }, { ...options, liquid: (op, part) => (part === "shadow" && !op.under ? null : options.liquid?.(op, part) ?? null) }));
      const casting = liquidOps(scene).filter((op) => op.shadow && !op.under);
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
    // Cleared first: a cover with no photo is clear but for its letters, so nothing else paints over what was there.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    aheadRef.current = () => thumbs?.forEach((s, i) => s && drawLayers(liquidOps(s), fullSize(s), `ahead-${STYLES[i].id}`, "ahead"));
  });

  // Once the picture is drawn, the cover in every other style is made at its
  // own size, ahead of time and on a worker of its own, so a style picked
  // shows at once. Asked again for each new picture; what is no longer the
  // picture is dropped before it is made.
  useEffect(() => {
    if (!pictureReady) return;
    const timer = window.setTimeout(() => aheadRef.current(), AHEAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, pictureReady]);

  // Draw the cover, then make its file, so a tap on Save can share it at
  // once: Safari refuses a share that waits on anything. Only a change to
  // the picture draws again; a render for anything else (the grid crop, the
  // dialog) leaves the canvas alone.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const mainTarget = fullSize(scene);
    const ops = liquidOps(scene);
    // Asked every time: what the preview shows is kept, what it waits on is drawn.
    // The canvas's size is set only here, as it is painted, so the last
    // picture stays up, whole, until this one is ready.
    drawLayers(ops, mainTarget, "main", "main");
    // A quick draft of the paste, made smaller first, only while the preview's own is still to come.
    const draftTarget = draftSize(scene);
    drawLayers(layers.ready ? [] : ops, draftTarget, "draft", "draft");
    if (!pictureReady) {
      // Moved letters wait for their paste to be made again where they now are: until then, carried there from where they were.
      if (liveRef.current) {
        interimRef.current();
        return;
      }
      // Anything else shows its draft as soon as it is made, and sharpens when the paste is.
      const drafted = `draft ${key}`;
      if (!draftReady || painted.current === drafted) return;
      if (canvas.width !== scene.width) canvas.width = scene.width;
      if (canvas.height !== scene.height) canvas.height = scene.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paint(ctx, scene, { scale: 1, font: fontCss, grain: grain(), liquid: (op, part) => grown(liquidLayer(op, draftTarget, part), draftTarget.scale), photo: photoForRef.current(scene) });
      painted.current = drafted;
      return;
    }
    if (painted.current !== key) {
      if (canvas.width !== scene.width) canvas.width = scene.width;
      if (canvas.height !== scene.height) canvas.height = scene.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Cleared first: with no photo the picture is clear but for its letters (the owner's ask, 7 Oct), and the file is the same.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  }, [scene, name, key, pictureReady, draftReady, layers.ready, repaint]);

  useEffect(() => {
    const dialog = holdRef.current;
    if (held && dialog && !dialog.open) dialog.showModal();
  }, [held]);

  useEffect(() => {
    const dialog = videoRef.current;
    if (videoFile && dialog && !dialog.open) dialog.showModal();
  }, [videoFile]);

  // The preview's width on screen, followed: a playing animation is drawn as sharp as it is shown, and no sharper.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // Hidden (the phone view showing): the width last seen stands.
      if (width > 0) setShownWidth(Math.round(width * Math.min(2, window.devicePixelRatio || 1)));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Escape leaves the phone view, unless it is closing something else (a list, the camera).
  useEffect(() => {
    if (!phoneView) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      setPhoneView(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phoneView]);

  /**
   * The animated cover as a video: every frame at full size, then the
   * cover held, encoded in the page (video.ts), and downloaded, or on a
   * phone kept for a tap to share it. Pressed again while it is made, it
   * stops.
   */
  const saveVideo = async () => {
    if (makingRef.current) {
      // A double click's second half is not a change of mind.
      if (performance.now() - makingRef.current.since > STOP_AFTER_MS) makingRef.current.controller.abort();
      return;
    }
    if (!scene || !measurer || !filled) return;
    const full = planFor(scene, design.style, animation, measurer);
    const kind: VideoKind = photo ? "mp4" : "mov";
    const fileTitle = videoName(design.text, design.format, kind);
    const controller = new AbortController();
    const job = { controller, since: performance.now() };
    makingRef.current = job;
    setError(null);
    setMaking(0);
    let maker: Awaited<ReturnType<typeof videoMaker>> | null = null;
    // Stopped while it encodes: the encoder let go at once.
    controller.signal.addEventListener("abort", () => maker?.close(), { once: true });
    try {
      maker = await videoMaker(kind);
      if (controller.signal.aborted) throw new DOMException("Called off.", "AbortError");
      const encoder = maker;
      setMaking(0.04);
      const times = frameTimes(full.duration, VIDEO_FPS);
      const hold = holdFrames(VIDEO_FPS);
      await drawFrames(full, times, { target: fullSize(scene), font: fontCss, grain: grain(), photo: photoFor(scene) }, {
        slot: "video",
        use: "main",
        signal: controller.signal,
        onFrame: async (frame, i) => {
          const png = await pngOf(frame);
          await encoder.add(png);
          // The finished cover, held: the last frame again and again.
          if (i === times.length - 1) for (let h = 0; h < hold; h += 1) await encoder.add(png);
          setMaking(0.04 + 0.31 * ((i + 1) / times.length));
        },
      });
      // Encoding takes the most time: the most of the bar.
      const blob = await encoder.finish((done) => setMaking(0.35 + 0.65 * done));
      if (controller.signal.aborted) return;
      const file = new File([blob], fileTitle, { type: blob.type });
      if (method === "download") download(file);
      else setVideoFile(file);
    } catch (videoError) {
      if (!controller.signal.aborted && !isAbort(videoError)) setError("The video could not be made. Try again.");
    } finally {
      maker?.close();
      if (makingRef.current === job) makingRef.current = null;
      setMaking(null);
    }
  };

  /** The video made, shared from the tap that asked for it; downloaded where there is no share sheet. */
  const shareVideo = async () => {
    const file = videoFile;
    if (!file) return;
    videoRef.current?.close();
    try {
      if (canShareFiles()) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (shareError) {
      if (isAbort(shareError)) return;
    }
    download(file);
  };

  const save = async () => {
    if (design.animated) return saveVideo();
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

  const stickery = design.style === "stickery";
  const frameStyle = { "--rcm-ratio": `${format.width} / ${format.height}`, "--rcm-ratio-n": format.width / format.height } as CSSProperties;
  const saveLabel = design.animated ? (method === "share" ? "Save video" : "Download video") : method === "share" ? "Save image" : "Download";
  /** The profile grid's window of each frame of a playing animation, for the phone view's post. */
  const motionCrop = playing && format.grid ? { x: (format.grid.x * playing.frames[0].width) / format.width, y: (format.grid.y * playing.frames[0].width) / format.width, w: (format.grid.w * playing.frames[0].width) / format.width, h: (format.grid.h * playing.frames[0].width) / format.width } : undefined;
  const mod = apple ? "⌘" : "Ctrl+";
  const dark = design.ground === "dark";

  return (
    <main className={`${styles.root} ${interTight.variable}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {/* The site's own icon, the favicon itself (the owner's ask, 7 Oct), so the two can never differ. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.mark} src={icon.src} alt="" width={24} height={24} />
          {APP_NAME}
        </h1>
        <div className={styles.actions}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Shortcuts apple={apple} saveLabel={saveLabel} />
          <button
            type="button"
            className={styles.save}
            onClick={() => void save()}
            disabled={making === null && (!scene || !filled || !pictureReady)}
            aria-busy={making !== null || (filled && !pictureReady)}
            aria-label={making !== null ? "Stop making the video" : undefined}
            data-making={making !== null || undefined}
            style={{ "--rcm-made": `${Math.round((making ?? 0) * 100)}%` } as CSSProperties}
            title={
              making !== null
                ? "Press to stop"
                : !filled
                  ? "Type a title first"
                  : design.animated
                    ? photo
                      ? `MP4 video, ${format.width} by ${format.height}`
                      : `MOV video with no background, ${format.width} by ${format.height}`
                    : `PNG, ${format.width} by ${format.height}`
            }
          >
            <DownloadSimple size={18} weight="bold" aria-hidden="true" />
            {making !== null ? `Making video ${Math.round(making * 100)}%` : saveLabel}
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

          {/* The colour of Stickery's letters on its stickers, under its type. */}
          {stickery && <TextColourField mode={design.textMode} hue={design.textHue} shade={design.textShade} onPick={pickText} />}

          <div className={styles.field}>
            <div className={styles.labelRow}>
              {/* Stickery's colour is its stickers', its letters' their own; every other style's is its letters'. */}
              <span className={styles.label} id="rcm-colour-label">
                {stickery ? "Sticker colour" : "Colour"}
              </span>
              <HexChip hex={hex} of={stickery ? "the sticker colour's" : "the colour's"} />
            </div>
            <ColourSliders labelledBy="rcm-colour-label" hue={design.hue} shade={design.shade} onHue={(hue) => update({ hue })} onShade={(shade) => update({ shade })} />
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
          style={frameStyle}
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
          {/*
           * Everything that acts on the cover as a whole, in one row of one
           * height, at the top of the cover's column: undo and redo at its
           * left corner, the cover's background, a shuffle and the text put
           * back in its middle, animate and the phone view at its right
           * corner (the owner's layout, 7 Oct). Nothing in it comes or goes,
           * so nothing moves.
           */}
          <div className={styles.toolbar}>
            <div className={styles.toolGroup} role="group" aria-label="History">
              <button type="button" className={`${styles.tool} ${styles.tip}`} onClick={undo} disabled={steps.back === 0} aria-label="Undo" aria-keyshortcuts={apple ? "Meta+Z" : "Control+Z"} data-tip={`Undo  ${mod}Z`}>
                <ArrowUUpLeft size={18} weight="bold" aria-hidden="true" />
              </button>
              <button type="button" className={`${styles.tool} ${styles.tip}`} onClick={redo} disabled={steps.forward === 0} aria-label="Redo" aria-keyshortcuts={apple ? "Meta+Shift+Z" : "Control+Shift+Z"} data-tip={apple ? "Redo  ⇧⌘Z" : "Redo  Ctrl+Shift+Z"}>
                <ArrowUUpRight size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
            <div className={styles.toolGroup} role="group" aria-label="Cover">
              {/* One button for the background: the sun on a light one, turning to the moon on a dark one. */}
              <button
                type="button"
                className={`${styles.tool} ${styles.tip}`}
                onClick={() => update({ ground: dark ? "light" : "dark" })}
                aria-label={dark ? "Light background" : "Dark background"}
                data-tip={dark ? "Light background" : "Dark background"}
              >
                <span className={styles.groundIcon} data-dark={dark || undefined} aria-hidden="true">
                  <Sun className={styles.sun} size={18} weight="bold" />
                  <Moon className={styles.moon} size={18} weight="bold" />
                </span>
              </button>
              <button type="button" className={`${styles.tool} ${styles.tip}`} onClick={shuffle} aria-label="Shuffle" data-tip="Shuffle">
                <Shuffle size={18} weight="bold" aria-hidden="true" />
              </button>
              <button type="button" className={`${styles.tool} ${styles.tip}`} onClick={() => update({ place: HOME })} disabled={isHome(place)} aria-label="Reset text" data-tip="Reset text">
                <ArrowCounterClockwise size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
            <div className={styles.toolGroup} role="group" aria-label="View">
              {/* Not animated: opens the card to pick how. Animated: stops it (the owner's ask, 7 Oct). */}
              <button
                type="button"
                className={`${styles.tool} ${styles.tip}`}
                onClick={() => (design.animated ? update({ animated: false }) : setAnimateOpen(true))}
                aria-pressed={design.animated}
                aria-haspopup={design.animated ? undefined : "dialog"}
                aria-label="Animate"
                data-tip={design.animated ? "Stop animating" : "Animate"}
              >
                <Sparkle size={18} weight={design.animated ? "fill" : "bold"} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${styles.tool} ${styles.tip}`}
                onClick={() => {
                  setSelected(false);
                  setPhoneView((on) => !on);
                }}
                aria-pressed={phoneView}
                aria-label="Phone view"
                data-tip={phoneView ? "Back to the cover  Esc" : "Phone view"}
              >
                <DeviceMobile size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={styles.stage} ref={stageRef}>
            {/* The cover to edit stays drawn while the phone view shows, so Download is never kept waiting. */}
            <div className={styles.frame} hidden={phoneView} data-ground={design.ground} data-clear={!photo || undefined} data-playing={playing ? "" : undefined}>
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                role="img"
                aria-label={`${format.label} preview`}
              />
              {/* The animation playing over the cover, which stays drawn under it for its file; gone while the letters are pressed, to be placed. */}
              {playing && <MotionCanvas motion={playing} className={`${styles.canvas} ${styles.motion}`} />}

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
            {phoneView && (
              <PhoneView
                reel={format.id === "reel"}
                ground={design.ground}
                tile={playing ? <MotionCanvas motion={playing} crop={motionCrop} className={styles.thumbCanvas} /> : <SceneCanvas scene={scene} target={gridWindow(format, tilePixels())} slot="phone" photoFor={photoFor} />}
              >
                {dropping && (
                  <div className={styles.dropHint} aria-hidden="true">
                    Drop to use as the photo
                  </div>
                )}
              </PhoneView>
            )}
          </div>

          <div className={styles.styles} role="radiogroup" aria-label="Style" data-ground={design.ground} data-clear={!photo || undefined}>
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
                  <SceneCanvas scene={thumbs?.[i] ?? null} target={wholeCover(format, THUMB_WIDTH)} slot={`thumb-${style.id}`} photoFor={photoFor} />
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

      {animateOpen && scene && measurer && (
        <AnimateCard
          options={animationsFor(design.style)}
          current={animation}
          requestFor={(id) => ({
            key: `card|${key}|${id}`,
            plan: planFor(scene, design.style, id, measurer),
            setting: () => ({ target: wholeCover(format, CARD_WIDTH), font: fontCss, grain: grain(), photo: photoForRef.current(scene) }),
            slot: `motion-card-${id}`,
          })}
          still={<SceneCanvas scene={scene} target={wholeCover(format, CARD_WIDTH)} slot="animate-still" photoFor={photoFor} />}
          ratio={format.width / format.height}
          clear={!photo}
          ground={design.ground}
          onSave={(id) => {
            setAnimateOpen(false);
            update({ animated: true, animations: { ...design.animations, [design.style]: id } });
          }}
          onClose={() => setAnimateOpen(false)}
        />
      )}

      <dialog ref={videoRef} className={styles.dialog} onClose={() => setVideoFile(null)} aria-label="Save the video">
        <p className={styles.holdText}>The video is ready.</p>
        <button type="button" className={styles.save} onClick={() => void shareVideo()}>
          <DownloadSimple size={18} weight="bold" aria-hidden="true" />
          Save video
        </button>
      </dialog>

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
