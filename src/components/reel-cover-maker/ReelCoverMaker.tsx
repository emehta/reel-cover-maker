"use client";

import { DownloadSimple, FrameCorners, Moon, Shuffle, Sun } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { hueTrack, shadeTrack, sliderColour } from "@/components/reel-cover-maker/colour";
import { loadDesign, saveDesign, type Design } from "@/components/reel-cover-maker/design";
import { Dropdown } from "@/components/reel-cover-maker/Dropdown";
import { PLAIN_FACES } from "@/components/reel-cover-maker/faces";
import { facesFor, fontCss, fontsSnapshot, interTight, measurerFor, requestFonts, subscribeFonts } from "@/components/reel-cover-maker/fonts";
import { FORMATS, formatById, type Format } from "@/components/reel-cover-maker/formats";
import { GRAIN_TILE, grainPixels } from "@/components/reel-cover-maker/grain";
import { APP_NAME } from "@/components/reel-cover-maker/meta";
import { paint } from "@/components/reel-cover-maker/paint";
import { paletteFor, standsOut, type Ground } from "@/components/reel-cover-maker/palettes";
import { fileName, FILE_TYPE, isAndroid, isInAppBrowser, saveMethod, type SaveMethod } from "@/components/reel-cover-maker/save";
import { drawLayers, layerFailed, layerReady, layersVersion, liquidLayer, subscribeLayers } from "@/components/reel-cover-maker/liquid-client";
import type { LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import { buildScene, LETTERINGS, letteringFace, liquidOps, STYLES, type CoverInput, type Scene } from "@/components/reel-cover-maker/scene";
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
  const key = JSON.stringify([input.title, input.style, input.lettering, input.plainFace, input.hue, input.shade, input.ground, input.format, input.seed, loads]);
  let scene = scenes.get(key);
  if (!scene) {
    scene = buildScene(input, measurerFor(loads));
    scenes.set(key, scene);
    while (scenes.size > 64) scenes.delete(scenes.keys().next().value as string);
  }
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
function Thumb({ scene, format, slot }: { scene: Scene | null; format: Format; slot: string }) {
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
    paint(ctx, scene, { scale, origin: target.origin, font: fontCss, grain: null, liquid: (op) => liquidLayer(op, target) ?? null });
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
  const [showGrid, setShowGrid] = useState(false);
  const [held, setHeld] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLDialogElement>(null);
  const prepared = useRef<{ key: string; file: File } | null>(null);
  /** What is on the canvas. */
  const painted = useRef<string | null>(null);
  const saveRef = useRef<() => void>(() => {});

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
    hue: design.hue,
    shade: design.shade,
    ground: design.ground,
    format: design.format,
    seed: design.seed,
  };
  const scene = measurer ? sceneFor(input, loads) : null;
  const thumbs = measurer ? STYLES.map((style) => sceneFor({ ...input, style: style.id }, loads)) : null;
  const name = fileName(design.text, design.format);
  // Drawn again when a liquid layer the preview waits on arrives.
  useSyncExternalStore(subscribeLayers, layersVersion, () => 0);
  const layers = layersFor(scene, scene && fullSize(scene));
  /** The whole picture can be drawn now: no liquid layer of it is still being drawn, and none failed. */
  const pictureReady = layers.ready && !layers.failed;
  /** What the drawn picture is of; a prepared file is handed over only if it is of the same. */
  const key = JSON.stringify([design.text, design.style, design.lettering, design.plainFace, design.hue, design.shade, design.ground, design.format, design.seed, loads]);

  const update = (change: Partial<Design>) => {
    const next = { ...design, ...change };
    setDesign(next);
    saveDesign(next);
    setError(null);
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

  // A computer is here to type; a phone's keyboard should wait to be asked for.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

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
    if (!pictureReady) return;
    if (painted.current !== key) {
      if (canvas.width !== scene.width) canvas.width = scene.width;
      if (canvas.height !== scene.height) canvas.height = scene.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paint(ctx, scene, { scale: 1, font: fontCss, grain: grain(), liquid: (op) => liquidLayer(op, mainTarget) ?? null });
      painted.current = key;
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
  }, [scene, name, key, pictureReady]);

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
  });

  // Cmd or Ctrl and S saves the cover rather than the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const s = event.code === "KeyS" || event.key.toLowerCase() === "s";
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && s) {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rcm-title">
              Title
            </label>
            <textarea
              ref={inputRef}
              id="rcm-title"
              className={styles.input}
              value={design.text}
              onChange={(event) => update({ text: event.target.value })}
              placeholder={PLACEHOLDER_TITLE}
              maxLength={MAX_TITLE_LENGTH}
              rows={3}
              spellCheck
            />
            {scene?.truncated && <p className={styles.note}>Too long for the cover: the end is cut.</p>}
            {layers.failed && <p className={styles.note}>This style could not be drawn here. Try another.</p>}
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label} id="rcm-style-label">
                Style
              </span>
              <button type="button" className={styles.toggle} onClick={shuffle} title="Draw the letters another way">
                <Shuffle size={16} weight="bold" aria-hidden="true" />
                Shuffle
              </button>
            </div>
            <div ref={stylesRef} className={styles.styles} role="radiogroup" aria-labelledby="rcm-style-label">
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
                    <Thumb scene={thumbs?.[i] ?? null} format={format} slot={`thumb-${style.id}`} />
                  </span>
                  <span className={styles.styleName}>{style.name}</span>
                </label>
              ))}
            </div>
          </div>

          {design.style === "stickery" && (
            <div className={styles.pickRow}>
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
            </div>
          )}

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span className={styles.label} id="rcm-colour-label">
                Colour
              </span>
              <span className={styles.chip} style={{ background: sliderColour(design.hue, design.shade) }} aria-hidden="true" />
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
            {design.style !== "stickery" && !standsOut(paletteFor(design)) && (
              <p className={styles.hint}>Close to the background in lightness: the letters may blur once posted.</p>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="rcm-format-label">
              Size
            </span>
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

        <section className={styles.preview} aria-label="Preview">
          <div className={styles.previewTop}>
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
          <div className={styles.stage}>
            <div className={styles.frame} style={frameStyle}>
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                role="img"
                aria-label={`${format.label} preview`}
              />
              {showGrid && <GridMask format={format} />}
            </div>
          </div>
          <div className={styles.previewBar}>
            <span className={styles.dims}>
              {format.width} × {format.height}
            </span>
            {format.grid && (
              <button
                type="button"
                className={styles.toggle}
                aria-pressed={showGrid}
                onClick={() => setShowGrid(!showGrid)}
              >
                <FrameCorners size={16} weight="bold" aria-hidden="true" />
                Grid crop
              </button>
            )}
          </div>
        </section>
      </div>

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
