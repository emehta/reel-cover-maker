"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import type { Animation, AnimationId } from "@/components/reel-cover-maker/animate";
import { MotionCanvas, useMotion, type MotionRequest } from "@/components/reel-cover-maker/Motion";
import type { Ground } from "@/components/reel-cover-maker/palettes";

interface Props {
  /** The style's animations, and the one it is on. */
  options: readonly Animation[];
  current: AnimationId;
  /** What an option's preview is drawn from: the cover as it is, in that animation, for a tile. */
  requestFor: (id: AnimationId) => MotionRequest | null;
  /** The cover standing still, shown in a tile while its animation is drawn. */
  still: ReactNode;
  /** The cover's shape: its width over its height. */
  ratio: number;
  /** With no photo, the cover is clear: shown on a check of the ground chosen, as the preview is. */
  clear: boolean;
  ground: Ground;
  onSave: (id: AnimationId) => void;
  onClose: () => void;
}

/**
 * The card Animate opens, in the middle of the page (the owner's ask, 7
 * Oct): the cover in each of its style's animations, playing, to pick one
 * of, and Save. Cancel, Escape or the cross leave the cover as it was. A
 * double click on one picks it and saves.
 */
export function AnimateCard({ options, current, requestFor, still, ratio, clear, ground, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<AnimationId>(current);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

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
        <h2 className={styles.animateTitle} id="rcm-animate-title">
          Animate
        </h2>
        <button type="button" className={`${styles.tool} ${styles.tip} ${styles.animateClose}`} onClick={onClose} aria-label="Close" data-tip="Close  Esc">
          <X size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className={styles.animateTiles} role="radiogroup" aria-labelledby="rcm-animate-title" style={{ "--rcm-ratio": String(ratio), "--rcm-ratio-n": ratio, "--rcm-count": options.length } as CSSProperties}>
        {options.map((option) => (
          <Tile key={option.id} option={option} picked={picked === option.id} onPick={() => setPicked(option.id)} onChoose={() => onSave(option.id)} request={requestFor(option.id)} still={still} clear={clear} ground={ground} />
        ))}
      </div>
      <div className={styles.animateFoot}>
        <button type="button" className={styles.quietButton} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.save} onClick={() => onSave(picked)}>
          Save
        </button>
      </div>
    </dialog>
  );
}

interface TileProps {
  option: Animation;
  picked: boolean;
  onPick: () => void;
  onChoose: () => void;
  request: MotionRequest | null;
  still: ReactNode;
  clear: boolean;
  ground: Ground;
}

/** One animation, playing on the cover as it is. */
function Tile({ option, picked, onPick, onChoose, request, still, clear, ground }: TileProps) {
  const motion = useMotion(request);
  const playing = motion && request && motion.key === request.key ? motion : null;
  return (
    <label className={styles.animTile} onDoubleClick={onChoose}>
      <input type="radio" name="rcm-animation" className={styles.radio} checked={picked} onChange={onPick} />
      <span className={styles.animPreview} data-clear={clear || undefined} data-ground={ground} aria-busy={!playing}>
        {playing ? <MotionCanvas motion={playing} className={styles.thumbCanvas} /> : still}
      </span>
      <span className={styles.styleName}>{option.name}</span>
    </label>
  );
}
