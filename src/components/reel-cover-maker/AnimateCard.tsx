"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { speedAtPlace, speedPlace, type Animation, type AnimationId } from "@/components/reel-cover-maker/animate";
import type { LiquidTarget } from "@/components/reel-cover-maker/liquid-render";
import { PlayCanvas, usePaste, type PlayRequest } from "@/components/reel-cover-maker/Motion";
import type { Ground } from "@/components/reel-cover-maker/palettes";

interface Props {
  /** The style's animations, and the one it is on. */
  options: readonly Animation[];
  current: AnimationId;
  /** The speed it plays at, times its own. */
  speed: number;
  /** What an option's preview is played from: the cover as it is, in that animation, at its own speed. */
  requestFor: (id: AnimationId) => PlayRequest | null;
  /** A tile's canvas: its pixels, and the picture's scale on it. */
  target: LiquidTarget;
  /** The cover standing still, shown in a tile while its paste is made. */
  still: ReactNode;
  /** The cover's shape: its width over its height. */
  ratio: number;
  /** With no photo, the cover is clear: shown on a check of the ground chosen, as the preview is. */
  clear: boolean;
  ground: Ground;
  onSave: (id: AnimationId, speed: number) => void;
  onClose: () => void;
}

/** A speed as it is said: "1×", "1.25×". */
function speedLabel(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}

/**
 * The card Animate opens, in the middle of the page (the owner's asks, 7
 * Oct): the cover playing in each of its style's animations, to pick one
 * of, a speed for it, and Save. Cancel, Escape or the cross leave the cover
 * as it was; a double click on one picks it and saves.
 *
 * The speed is a throttle that slides smoothly (the owner, 8 Oct: not set
 * steps), its own speed in the middle, half as fast at the left and twice
 * at the right; it catches in the middle on the way past, and a double
 * click puts it back there.
 */
export function AnimateCard({ options, current, speed, requestFor, target, still, ratio, clear, ground, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [picked, setPicked] = useState<AnimationId>(current);
  const [pace, setPace] = useState(speed);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // The card's name takes the focus, not its first button: Safari draws a button focused so with its ring, and its tooltip shows.
      heading.current?.focus({ preventScroll: true });
    }
  }, []);

  const place = speedPlace(pace);
  const along = (v: number) => `${((v + 1) / 2) * 100}%`;

  return (
    <dialog
      ref={ref}
      className={styles.animateDialog}
      aria-labelledby="rcm-animate-title"
      onCancel={(event) => {
        // Escape: closed by the page, so it is closed the one way.
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.animateHead}>
        <h2 ref={heading} tabIndex={-1} className={styles.animateTitle} id="rcm-animate-title">
          Animate
        </h2>
        <button type="button" className={`${styles.tool} ${styles.tip} ${styles.animateClose}`} onClick={onClose} aria-label="Close" data-tip="Close  Esc">
          <X size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className={styles.animateTiles} role="radiogroup" aria-labelledby="rcm-animate-title" style={{ "--rcm-ratio": String(ratio), "--rcm-ratio-n": ratio, "--rcm-count": options.length } as CSSProperties}>
        {options.map((option) => (
          <Tile key={option.id} option={option} picked={picked === option.id} onPick={() => setPicked(option.id)} onChoose={() => onSave(option.id, pace)} request={requestFor(option.id)} speed={pace} target={target} still={still} clear={clear} ground={ground} />
        ))}
      </div>
      <div className={styles.animateFoot}>
        <label className={styles.speed}>
          <span className={styles.speedName}>Speed</span>
          <span className={styles.speedTrack}>
            <input
              type="range"
              className={styles.thinSlider}
              min={-1}
              max={1}
              step={0.01}
              value={place}
              onChange={(event) => setPace(speedAtPlace(Number(event.target.value)))}
              onDoubleClick={() => setPace(1)}
              style={{ "--rcm-from": along(Math.min(0, place)), "--rcm-to": along(Math.max(0, place)) } as CSSProperties}
              aria-valuetext={speedLabel(pace)}
            />
          </span>
          <span className={styles.value}>{speedLabel(pace)}</span>
        </label>
        <span className={styles.animateButtons}>
          <button type="button" className={styles.quietButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.save} onClick={() => onSave(picked, pace)}>
            Save
          </button>
        </span>
      </div>
    </dialog>
  );
}

interface TileProps {
  option: Animation;
  picked: boolean;
  onPick: () => void;
  onChoose: () => void;
  request: PlayRequest | null;
  speed: number;
  target: LiquidTarget;
  still: ReactNode;
  clear: boolean;
  ground: Ground;
}

/** One animation, playing on the cover as it is. */
function Tile({ option, picked, onPick, onChoose, request, speed, target, still, clear, ground }: TileProps) {
  const paste = usePaste(request, target);
  return (
    <label className={styles.animTile} onDoubleClick={onChoose}>
      <input type="radio" name="rcm-animation" className={styles.radio} checked={picked} onChange={onPick} />
      <span className={styles.animPreview} data-clear={clear || undefined} data-ground={ground} aria-busy={!paste}>
        {request && paste ? <PlayCanvas request={request} speed={speed} paste={paste} target={target} className={styles.thumbCanvas} /> : still}
      </span>
      <span className={styles.styleName}>{option.name}</span>
    </label>
  );
}
