"use client";

import { ArrowCounterClockwise, Camera as CameraIcon, CornersIn, FlipHorizontal, Image as ImageIcon, Trash, UploadSimple } from "@phosphor-icons/react";
import { useId, useRef, useState, type CSSProperties, type DragEvent } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { ADJUSTMENTS, DEFAULT_ADJUST, DEFAULT_FRAME, MAX_ZOOM, adjustLabel, isNeutral, type PhotoAdjust, type PhotoFrame } from "@/components/reel-cover-maker/photo";

interface Props {
  /** A picture of the photo, or null where there is none. */
  thumb: string | null;
  frame: PhotoFrame;
  adjust: PhotoAdjust;
  /** A file chosen, taken or dropped, to read as the new photo. */
  onFile: (file: Blob) => void;
  /** Opens the computer's camera, where the page has to open one itself: false where the file field's own camera serves instead (a phone). */
  onCamera: () => boolean;
  onRemove: () => void;
  onFrame: (frame: PhotoFrame) => void;
  onAdjust: (adjust: PhotoAdjust) => void;
}

/**
 * The photo behind the cover, in a column of its own beside it: a slot
 * that takes the photo (Upload, Take photo, or a file dropped on it) and
 * then shows it, with Replace and a new photo over it and Mirror, Fit and
 * Remove beside its label; then its zoom, and every adjustment, each
 * reading what it does and back to nothing at a double click. The slot
 * keeps one height and the sliders are there, waiting, before a photo is,
 * so nothing moves when one is added.
 */
export function PhotoControls({ thumb, frame, adjust, onFile, onCamera, onRemove, onFrame, onAdjust }: Props) {
  const id = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const has = thumb !== null;
  const adjusted = !isNeutral(adjust);
  const framed = frame.zoom !== 1 || frame.cx !== 0.5 || frame.cy !== 0.5;

  const take = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file) onFile(file);
  };
  const camera = () => {
    if (!onCamera()) captureRef.current?.click();
  };
  const upload = () => uploadRef.current?.click();
  const files = (event: DragEvent) => [...event.dataTransfer.types].includes("Files");

  return (
    <aside className={styles.photoPanel} aria-label="Photo">
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label} id={`${id}-label`}>
            Photo
          </span>
          {has && (
            <span className={styles.photoActions} role="group" aria-labelledby={`${id}-label`}>
              <button type="button" className={styles.smallIcon} aria-pressed={frame.flip} onClick={() => onFrame({ ...frame, flip: !frame.flip })} title="Mirror" aria-label="Mirror the photo">
                <FlipHorizontal size={16} weight="bold" />
              </button>
              <button type="button" className={styles.smallIcon} onClick={() => onFrame({ ...DEFAULT_FRAME, flip: frame.flip })} disabled={!framed} title="Fit the whole photo" aria-label="Fit the whole photo again">
                <CornersIn size={16} weight="bold" />
              </button>
              <button type="button" className={`${styles.smallIcon} ${styles.danger}`} onClick={onRemove} title="Remove" aria-label="Remove the photo">
                <Trash size={16} weight="bold" />
              </button>
            </span>
          )}
        </div>
        <input ref={uploadRef} type="file" accept="image/*" className={styles.hidden} tabIndex={-1} aria-hidden="true" onChange={(e) => take(e.currentTarget)} />
        <input ref={captureRef} type="file" accept="image/*" capture="environment" className={styles.hidden} tabIndex={-1} aria-hidden="true" onChange={(e) => take(e.currentTarget)} />

        <div
          className={styles.photoSlot}
          data-over={over || undefined}
          data-empty={!has || undefined}
          onDragOver={(event) => {
            if (!files(event)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(event) => {
            if (!files(event)) return;
            event.preventDefault();
            event.stopPropagation();
            setOver(false);
            const file = [...event.dataTransfer.files].find((f) => f.type.startsWith("image/"));
            if (file) onFile(file);
          }}
        >
          {has ? (
            <>
              {/* A data URL made of the photo here: next/image has nothing to add to it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.photoPicture} src={thumb} alt="The photo behind the cover" style={frame.flip ? { transform: "scaleX(-1)" } : undefined} />
              <span className={styles.photoOver}>
                <button type="button" className={styles.glassButton} onClick={upload}>
                  <UploadSimple size={15} weight="bold" aria-hidden="true" />
                  Replace
                </button>
                <button type="button" className={styles.glassButton} onClick={camera} aria-label="Take a new photo" title="Take a new photo">
                  <CameraIcon size={15} weight="bold" aria-hidden="true" />
                </button>
              </span>
            </>
          ) : (
            <span className={styles.photoAdd}>
              <ImageIcon size={26} weight="duotone" aria-hidden="true" className={styles.photoAddIcon} />
              <span className={styles.photoAddButtons}>
                <button type="button" className={styles.photoButton} onClick={upload}>
                  <UploadSimple size={16} weight="bold" aria-hidden="true" />
                  Upload
                </button>
                <button type="button" className={styles.photoButton} onClick={camera}>
                  <CameraIcon size={16} weight="bold" aria-hidden="true" />
                  Take photo
                </button>
              </span>
            </span>
          )}
        </div>

        <label className={styles.adjustRow} data-off={!has || undefined}>
          <span className={styles.adjustName}>Zoom</span>
          <span className={styles.value}>{Math.round(frame.zoom * 100)}%</span>
          <input
            type="range"
            className={styles.thinSlider}
            style={fill(frame.zoom, 1, MAX_ZOOM, 1)}
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={frame.zoom}
            disabled={!has}
            onChange={(e) => onFrame({ ...frame, zoom: Number(e.target.value) })}
            onDoubleClick={() => onFrame({ ...frame, zoom: 1 })}
          />
        </label>
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <span className={styles.label} id={`${id}-adjust`}>
            Adjust
          </span>
          {adjusted && has && (
            <button type="button" className={styles.linkButton} onClick={() => onAdjust(DEFAULT_ADJUST)}>
              <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
              Reset
            </button>
          )}
        </div>
        <div className={styles.adjustList} role="group" aria-labelledby={`${id}-adjust`}>
          {ADJUSTMENTS.map((a) => (
            <label key={a.key} className={styles.adjustRow} data-off={!has || undefined} title={has ? "Double-click to reset" : undefined}>
              <span className={styles.adjustName}>{a.name}</span>
              <span className={styles.value}>{adjustLabel(a.key, adjust[a.key])}</span>
              <input
                type="range"
                className={styles.thinSlider}
                style={fill(adjust[a.key], a.min, a.max, DEFAULT_ADJUST[a.key])}
                min={a.min}
                max={a.max}
                step={a.step}
                value={adjust[a.key]}
                disabled={!has}
                onChange={(e) => onAdjust({ ...adjust, [a.key]: Number(e.target.value) })}
                onDoubleClick={() => onAdjust({ ...adjust, [a.key]: DEFAULT_ADJUST[a.key] })}
              />
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** A thin slider's fill, from its resting value to where it is, as shares of its track. */
function fill(value: number, min: number, max: number, rest: number): CSSProperties {
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const [from, to] = value < rest ? [at(value), at(rest)] : [at(rest), at(value)];
  return { "--rcm-from": from, "--rcm-to": to } as CSSProperties;
}
