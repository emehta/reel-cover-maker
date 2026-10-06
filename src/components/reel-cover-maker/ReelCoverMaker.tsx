"use client";

import { DownloadSimple, FrameCorners } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { loadDesign, saveDesign, type Design } from "@/components/reel-cover-maker/design";
import { fontCss, fontsSnapshot, interTight, measurerFor, requestFonts, subscribeFonts } from "@/components/reel-cover-maker/fonts";
import { FORMATS, formatById, type Format } from "@/components/reel-cover-maker/formats";
import { GRAIN_TILE, grainPixels } from "@/components/reel-cover-maker/grain";
import { APP_NAME } from "@/components/reel-cover-maker/meta";
import { paint } from "@/components/reel-cover-maker/paint";
import { PALETTES } from "@/components/reel-cover-maker/palettes";
import { fileName, FILE_TYPE, isAndroid, isInAppBrowser, saveMethod, type SaveMethod } from "@/components/reel-cover-maker/save";
import { buildScene, STYLES, type Scene } from "@/components/reel-cover-maker/scene";
import { applyBackdrop, clearBackdrop } from "@/components/reel-cover-maker/theme";
import { hasTitle, MAX_TITLE_LENGTH, PLACEHOLDER_TITLE } from "@/components/reel-cover-maker/title";

/** How long typing must pause before the file is made ready to hand over. A tap on a style, colour or size makes it at once. */
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

/** A style's swatch: the title in that style, as the profile grid would show it. */
function Thumb({ scene, format }: { scene: Scene | null; format: Format }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !scene) return;
    const window = gridWindow(format);
    const scale = THUMB_WIDTH / window.w;
    const height = Math.round(window.h * scale);
    if (canvas.width !== THUMB_WIDTH) canvas.width = THUMB_WIDTH;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paint(ctx, scene, { scale, origin: window, font: fontCss, grain: null });
  }, [scene, format]);
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
  const holdRef = useRef<HTMLDialogElement>(null);
  const prepared = useRef<{ key: string; file: File } | null>(null);
  /** What is on the canvas, and the title of the last picture drawn. */
  const painted = useRef<string | null>(null);
  const drawnText = useRef<string | null>(null);
  const saveRef = useRef<() => void>(() => {});

  const filled = hasTitle(design.text);
  const title = filled ? design.text : PLACEHOLDER_TITLE;
  const format = formatById(design.format);

  const loads = useSyncExternalStore(subscribeFonts, () => fontsSnapshot(title), () => -1);
  const method = useSyncExternalStore<SaveMethod>(subscribeTouch, currentSaveMethod, () => "download");

  const measurer = loads >= 0 ? measurerFor(loads) : null;
  const scene = measurer ? buildScene({ title, style: design.style, palette: design.palette, format: design.format }, measurer) : null;
  const thumbs = measurer
    ? STYLES.map((style) => buildScene({ title, style: style.id, palette: design.palette, format: design.format }, measurer))
    : null;
  const name = fileName(design.text, design.format);
  /** What the drawn picture is of; a prepared file is handed over only if it is of the same. */
  const key = JSON.stringify([design.text, design.style, design.palette, design.format, loads]);

  const update = (change: Partial<Design>) => {
    const next = { ...design, ...change };
    setDesign(next);
    saveDesign(next);
    setError(null);
  };

  useEffect(() => requestFonts(title), [title]);

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
    if (painted.current !== key) {
      if (canvas.width !== scene.width) canvas.width = scene.width;
      if (canvas.height !== scene.height) canvas.height = scene.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paint(ctx, scene, { scale: 1, font: fontCss, grain: grain() });
      painted.current = key;
    }
    if (prepared.current?.key === key) return;
    // Typing waits for a pause before the file is made; a tap on a style,
    // a colour or a size, or a face arriving, does not.
    const typing = drawnText.current !== null && drawnText.current !== design.text;
    drawnText.current = design.text;
    const timer = window.setTimeout(
      () => {
        canvasFile(canvas, name).then(
          (file) => {
            if (painted.current === key) prepared.current = { key, file };
          },
          () => {},
        );
      },
      typing ? PREPARE_DELAY_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [scene, name, key, design.text]);

  useEffect(() => {
    const dialog = holdRef.current;
    if (held && dialog && !dialog.open) dialog.showModal();
  }, [held]);

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || !filled) return;
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
            disabled={!scene || !filled}
            title={filled ? `PNG, ${format.width} by ${format.height}` : "Type a title first"}
          >
            <DownloadSimple size={18} weight="bold" aria-hidden="true" />
            {saveLabel}
          </button>
        </div>
      </header>

      <div className={styles.main}>
        <section className={styles.preview} aria-label="Preview">
          <div className={styles.stage}>
            <div className={styles.frame} style={frameStyle}>
              <canvas
                ref={canvasRef}
                className={styles.canvas}
                width={format.width}
                height={format.height}
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
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="rcm-style-label">
              Style
            </span>
            <div className={styles.styles} role="radiogroup" aria-labelledby="rcm-style-label">
              {STYLES.map((style, i) => (
                <label key={style.id} className={styles.style}>
                  <input
                    type="radio"
                    name="rcm-style"
                    className={styles.radio}
                    checked={design.style === style.id}
                    onChange={() => update({ style: style.id })}
                  />
                  <span className={styles.thumb}>
                    <Thumb scene={thumbs?.[i] ?? null} format={format} />
                  </span>
                  <span className={styles.styleName}>{style.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="rcm-palette-label">
              Colour
            </span>
            <div className={styles.swatches} role="radiogroup" aria-labelledby="rcm-palette-label">
              {PALETTES.map((palette) => (
                <label key={palette.id} className={styles.swatch} title={palette.name}>
                  <input
                    type="radio"
                    name="rcm-palette"
                    className={styles.radio}
                    checked={design.palette === palette.id}
                    onChange={() => update({ palette: palette.id })}
                  />
                  <span className={styles.swatchFace} style={{ background: palette.bg }}>
                    <span className={styles.swatchDot} style={{ background: palette.accent }} />
                  </span>
                  <span className={styles.hidden}>{palette.name}</span>
                </label>
              ))}
            </div>
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
