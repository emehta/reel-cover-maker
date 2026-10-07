"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useRef, useState, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { hueTrack, shadeTrack, sliderColour } from "@/components/reel-cover-maker/colour";
import { SOFT_BLACK, SOFT_WHITE, TEXT_MODES, textColour, type TextMode } from "@/components/reel-cover-maker/palettes";

/** How long a copied colour says it was copied. */
const COPIED_MS = 1600;

/** Text put on the clipboard; false if the browser would not. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard API (an old browser, a page not served securely): the old way.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand("copy");
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/**
 * A colour, and its hex code, which a click copies: said to be copied at
 * once (on a touch screen too, which has no hover to show it) while it is
 * still the colour, and for a moment after. Each chip says so of its own.
 */
export function HexChip({ hex, of }: { hex: string; of: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef(0);
  const isCopied = copied === hex;
  const copy = async () => {
    if (!(await copyText(hex))) return;
    setCopied(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  };
  return (
    <>
      <button type="button" className={`${styles.hexChip} ${styles.tip}`} onClick={() => void copy()} data-tip={isCopied ? "Copied" : "Copy hex"} data-copied={isCopied || undefined} aria-label={`Copy ${of} hex code, ${hex}`}>
        <span className={styles.chip} style={{ background: hex }} aria-hidden="true" />
        <span className={styles.hex}>{hex}</span>
        <span className={styles.hexIcon} aria-hidden="true">
          {isCopied ? <Check size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
        </span>
      </button>
      <span className={styles.hidden} role="status">
        {isCopied ? `${hex} copied` : ""}
      </span>
    </>
  );
}

interface SlidersProps {
  /** The id of the field's label. */
  labelledBy: string;
  hue: number;
  shade: number;
  onHue: (hue: number) => void;
  onShade: (shade: number) => void;
  /** What each slider is called, said by a screen reader. */
  names?: readonly [string, string];
  /** Not the colour in use (Stickery's text left to auto, black or white): shown quieter, and a press or a move makes it the colour. */
  resting?: boolean;
  /** A resting slider pressed: the colour it shows is the one wanted, moved or not. */
  onWake?: () => void;
}

/** A colour's two sliders, hue and shade, each its own track: every hue at the shade, every shade of the hue. */
export function ColourSliders({ labelledBy, hue, shade, onHue, onShade, names = ["Hue", "Shade"], resting = false, onWake }: SlidersProps) {
  return (
    <div className={styles.sliders} role="group" aria-labelledby={labelledBy} data-resting={resting || undefined} onPointerDown={resting ? onWake : undefined}>
      <input
        type="range"
        className={styles.slider}
        style={{ "--rcm-track": hueTrack(shade) } as CSSProperties}
        min={0}
        max={360}
        step={1}
        value={Math.round(hue)}
        onChange={(event) => onHue(Number(event.target.value))}
        aria-label={names[0]}
      />
      <input
        type="range"
        className={styles.slider}
        style={{ "--rcm-track": shadeTrack(hue) } as CSSProperties}
        min={0}
        max={1}
        step={0.01}
        value={shade}
        onChange={(event) => onShade(Number(event.target.value))}
        aria-label={names[1]}
      />
    </div>
  );
}

interface TextColourProps {
  mode: TextMode;
  /** The hue and shade of the text's own colour, kept while another choice is made. */
  hue: number;
  shade: number;
  /** A change to the text colour: what changed, each part of it named. */
  onPick: (change: { textMode?: TextMode; textHue?: number; textShade?: number }) => void;
  /** The letters close to a sticker they are on in lightness. */
  low: boolean;
}

/**
 * Stickery's text colour (the owner's ask, 7 Oct): auto, black or white,
 * whichever reads on each sticker, as it always was; black or white on
 * every sticker; or a colour of its own from two sliders, as the stickers'
 * colour is. The sliders stay in sight, quieter, while another choice is
 * made, so nothing under them moves; a press on one picks its colour.
 */
export function TextColourField({ mode, hue, shade, onPick, low }: TextColourProps) {
  const hex = textColour(mode, hue, shade);
  /** Each choice's colour, for its swatch: auto is a sticker's black or white. */
  const swatch: Record<TextMode, string> = {
    auto: `linear-gradient(135deg, ${SOFT_BLACK} 50%, ${SOFT_WHITE} 50%)`,
    black: SOFT_BLACK,
    white: SOFT_WHITE,
    colour: sliderColour(hue, shade),
  };
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label} id="rcm-text-colour-label">
          Text colour
        </span>
        <span className={styles.colourSide}>
          {low && (
            <span className={styles.warnPill} title="The letters are close to their sticker in lightness, and may blur once Instagram compresses the cover">
              Low contrast
            </span>
          )}
          {/* Auto is each sticker's own black or white: no one colour to copy. */}
          {hex && <HexChip hex={hex} of="the text colour's" />}
        </span>
      </div>
      <div className={styles.segments} style={{ "--rcm-segments": TEXT_MODES.length } as CSSProperties} role="radiogroup" aria-labelledby="rcm-text-colour-label">
        {TEXT_MODES.map((m) => (
          <label key={m.id} className={styles.segment}>
            <input type="radio" name="rcm-text-colour" className={styles.radio} checked={mode === m.id} onChange={() => onPick({ textMode: m.id })} />
            <span className={styles.swatch} style={{ background: swatch[m.id] }} aria-hidden="true" />
            {m.name}
          </label>
        ))}
      </div>
      <ColourSliders
        labelledBy="rcm-text-colour-label"
        hue={hue}
        shade={shade}
        onHue={(textHue) => onPick({ textMode: "colour", textHue })}
        onShade={(textShade) => onPick({ textMode: "colour", textShade })}
        names={["Text hue", "Text shade"]}
        resting={mode !== "colour"}
        onWake={() => onPick({ textMode: "colour" })}
      />
    </div>
  );
}
