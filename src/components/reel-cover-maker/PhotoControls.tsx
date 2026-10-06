"use client";

import { ArrowCounterClockwise, Camera as CameraIcon, CaretRight, CornersIn, FlipHorizontal, Image as ImageIcon, MagnifyingGlassPlus, Trash, UploadSimple } from "@phosphor-icons/react";
import { useId, useRef, useState, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { ADJUSTMENTS, DEFAULT_ADJUST, DEFAULT_FRAME, MAX_ZOOM, adjustLabel, isNeutral, type PhotoAdjust, type PhotoFrame } from "@/components/reel-cover-maker/photo";

interface Props {
  /** A small picture of the photo, or null where there is none. */
  thumb: string | null;
  frame: PhotoFrame;
  adjust: PhotoAdjust;
  /** A file chosen or taken, to read as the new photo. */
  onFile: (file: Blob) => void;
  /** Opens the computer's camera, where the page has to open one itself: false where the file field's own camera serves instead (a phone). */
  onCamera: () => boolean;
  onRemove: () => void;
  onFrame: (frame: PhotoFrame) => void;
  onAdjust: (adjust: PhotoAdjust) => void;
}

/**
 * The photo behind the cover: added from the computer or the camera,
 * then framed (zoomed, mirrored, back to fitting) and adjusted, each slider
 * reading what it does to the photo and back to nothing at a double click.
 */
export function PhotoControls({ thumb, frame, adjust, onFile, onCamera, onRemove, onFrame, onAdjust }: Props) {
  const id = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const adjusted = !isNeutral(adjust);

  const take = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file) onFile(file);
  };
  const camera = () => {
    if (!onCamera()) captureRef.current?.click();
  };
  const upload = () => uploadRef.current?.click();

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label} id={`${id}-label`}>
          Photo
        </span>
      </div>
      <input ref={uploadRef} type="file" accept="image/*" className={styles.hidden} tabIndex={-1} aria-hidden="true" onChange={(e) => take(e.currentTarget)} />
      <input ref={captureRef} type="file" accept="image/*" capture="environment" className={styles.hidden} tabIndex={-1} aria-hidden="true" onChange={(e) => take(e.currentTarget)} />

      {!thumb ? (
        <div className={styles.photoAdd} role="group" aria-labelledby={`${id}-label`}>
          <button type="button" className={styles.photoButton} onClick={upload}>
            <ImageIcon size={18} weight="bold" aria-hidden="true" />
            Upload
          </button>
          <button type="button" className={styles.photoButton} onClick={camera}>
            <CameraIcon size={18} weight="bold" aria-hidden="true" />
            Take photo
          </button>
        </div>
      ) : (
        <>
          <div className={styles.photoRow}>
            {/* A data URL made of the photo here: next/image has nothing to add to it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.photoThumb} src={thumb} alt="The photo behind the cover" />
            <div className={styles.photoTools} role="group" aria-labelledby={`${id}-label`}>
              <button type="button" className={styles.iconButton} onClick={upload} title="Replace the photo" aria-label="Replace the photo">
                <UploadSimple size={18} weight="bold" />
              </button>
              <button type="button" className={styles.iconButton} onClick={camera} title="Take a new photo" aria-label="Take a new photo">
                <CameraIcon size={18} weight="bold" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-pressed={frame.flip}
                onClick={() => onFrame({ ...frame, flip: !frame.flip })}
                title="Mirror the photo"
                aria-label="Mirror the photo"
              >
                <FlipHorizontal size={18} weight="bold" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onFrame({ ...DEFAULT_FRAME, flip: frame.flip })}
                disabled={frame.zoom === 1 && frame.cx === 0.5 && frame.cy === 0.5}
                title="Fit the whole photo again"
                aria-label="Fit the whole photo again"
              >
                <CornersIn size={18} weight="bold" />
              </button>
              <button type="button" className={`${styles.iconButton} ${styles.danger}`} onClick={onRemove} title="Remove the photo" aria-label="Remove the photo">
                <Trash size={18} weight="bold" />
              </button>
            </div>
          </div>

          <label className={styles.zoomRow}>
            <MagnifyingGlassPlus size={16} weight="bold" aria-hidden="true" />
            <span className={styles.hidden}>Zoom</span>
            <input
              type="range"
              className={styles.thinSlider}
              style={fill(frame.zoom, 1, MAX_ZOOM, 1)}
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={frame.zoom}
              onChange={(e) => onFrame({ ...frame, zoom: Number(e.target.value) })}
              onDoubleClick={() => onFrame({ ...frame, zoom: 1 })}
            />
            <span className={styles.value}>{Math.round(frame.zoom * 100)}%</span>
          </label>

          <div className={styles.adjustHead}>
            <button type="button" className={styles.disclosure} aria-expanded={open} aria-controls={`${id}-adjust`} onClick={() => setOpen(!open)}>
              <CaretRight size={12} weight="bold" aria-hidden="true" className={styles.disclosureCaret} />
              Adjust
              {adjusted && <span className={styles.dot} aria-label="adjusted" />}
            </button>
            {adjusted && (
              <button type="button" className={styles.linkButton} onClick={() => onAdjust(DEFAULT_ADJUST)}>
                <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
          {open && (
            <div id={`${id}-adjust`} className={styles.adjustList}>
              {ADJUSTMENTS.map((a) => (
                <label key={a.key} className={styles.adjustRow} title="Double-click to reset">
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
                    onChange={(e) => onAdjust({ ...adjust, [a.key]: Number(e.target.value) })}
                    onDoubleClick={() => onAdjust({ ...adjust, [a.key]: DEFAULT_ADJUST[a.key] })}
                  />
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A thin slider's fill, from its resting value to where it is, as shares of its track. */
function fill(value: number, min: number, max: number, rest: number): CSSProperties {
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const [from, to] = value < rest ? [at(value), at(rest)] : [at(rest), at(value)];
  return { "--rcm-from": from, "--rcm-to": to } as CSSProperties;
}
