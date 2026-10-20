"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { hueTrack, parseHex, shadeTrack, sliderColour, slidersFor } from "@/components/reel-cover-maker/colour";
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

interface HexFieldProps {
  /** The colour shown, as its six capital digits. */
  hex: string;
  /** Whose colour it is, for a screen reader: "the colour", "the sticker colour". */
  name: string;
  /** A hex code typed: the colour it names, at each keystroke that makes one, so the cover follows the typing. */
  onHex: (hex: string) => void;
  /** Editing is begun: what is there now is what Escape puts back. */
  onBegin: () => void;
  /** Escape: the colour put back as it was before editing began. */
  onCancel: () => void;
}

/**
 * A colour's hex code, two things side by side (the owner's ask, 20 Oct:
 * the whole of it had been one copy button). The code itself, which a
 * press turns into a field to type a code of one's own in: three digits
 * or six, with or without the #, the cover following as each keystroke
 * makes a colour; Enter or a press elsewhere keeps it, Escape puts back
 * the colour from before. And beside it its copy button, which says it
 * copied at once (on a touch screen too, which has no hover to show it)
 * and for a moment after.
 */
export function HexField({ hex, name, onHex, onBegin, onCancel }: HexFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [seen, setSeen] = useState(hex);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  const isCopied = copied === hex;
  // The colour changed from elsewhere while typing (an undo): the field shows it.
  if (hex !== seen) {
    setSeen(hex);
    if (draft !== null && parseHex(draft) !== hex) setDraft(hex);
  }
  useEffect(() => {
    if (!editing) return;
    field.current?.focus();
    field.current?.select();
  }, [editing]);
  const copy = async () => {
    if (!(await copyText(hex))) return;
    setCopied(hex);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  };
  const typed = draft === null ? null : parseHex(draft);
  return (
    <span className={styles.hexField}>
      {editing ? (
        <span className={styles.hexEditing}>
          <span className={styles.chip} style={{ background: typed ?? hex }} aria-hidden="true" />
          <input
            ref={field}
            type="text"
            className={styles.hexInput}
            value={draft}
            maxLength={9}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            aria-label={`${name.charAt(0).toUpperCase()}${name.slice(1)} as a hex code`}
            aria-invalid={typed === null || undefined}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              const next = parseHex(text);
              if (next && next !== hex) onHex(next);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setDraft(null);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
                setDraft(null);
              }
            }}
            onBlur={() => setDraft(null)}
          />
        </span>
      ) : (
        <button
          type="button"
          className={`${styles.hexEdit} ${styles.tip}`}
          onClick={() => {
            onBegin();
            setDraft(hex);
          }}
          data-tip="Type a hex code"
          aria-label={`Type ${name}'s hex code, now ${hex}`}
        >
          <span className={styles.chip} style={{ background: hex }} aria-hidden="true" />
          <span className={styles.hex}>{hex}</span>
        </button>
      )}
      <button type="button" className={`${styles.copyHex} ${styles.tip}`} onClick={() => void copy()} data-tip={isCopied ? "Copied" : "Copy hex"} data-copied={isCopied || undefined} aria-label={`Copy ${name}'s hex code, ${hex}`}>
        {isCopied ? <Check size={13} weight="bold" /> : <Copy size={13} weight="bold" />}
      </button>
      <span className={styles.hidden} role="status">
        {isCopied ? `${hex} copied` : ""}
      </span>
    </span>
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

/** A change to a text colour: what changed, each part of it named. */
export interface TextColourChange {
  textMode?: TextMode;
  textHue?: number;
  textShade?: number;
  textHex?: string | null;
}

interface TextColourProps {
  mode: TextMode;
  /** The hue and shade of the text's own colour, kept while another choice is made, and a hex code typed for it. */
  hue: number;
  shade: number;
  hex: string | null;
  /** A change to the text colour: what changed, each part of it named. */
  onPick: (change: TextColourChange) => void;
}

/**
 * Stickery's text colour (the owner's ask, 7 Oct): auto, black or white,
 * whichever reads on each sticker, as it always was; black or white on
 * every sticker; or a colour of its own from two sliders, as the stickers'
 * colour is, or typed as a hex code. The sliders stay in sight, quieter,
 * while another choice is made, so nothing under them moves; a press on
 * one picks its colour.
 */
export function TextColourField({ mode, hue, shade, hex, onPick }: TextColourProps) {
  const shown = textColour(mode, hue, shade, hex);
  const before = useRef<TextColourChange | null>(null);
  /** Each choice's colour, for its swatch: auto is a sticker's black or white. */
  const swatch: Record<TextMode, string> = {
    auto: `linear-gradient(135deg, ${SOFT_BLACK} 50%, ${SOFT_WHITE} 50%)`,
    black: SOFT_BLACK,
    white: SOFT_WHITE,
    colour: hex ?? sliderColour(hue, shade),
  };
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.label} id="rcm-text-colour-label">
          Text colour
        </span>
        {/* Auto is each sticker's own black or white: no one colour to copy or type over. A code typed makes it the text's own colour. */}
        {shown && (
          <HexField
            hex={shown}
            name="the text colour"
            onBegin={() => (before.current = { textMode: mode, textHue: hue, textShade: shade, textHex: hex })}
            onHex={(typed) => {
              const near = slidersFor(typed, hue);
              onPick({ textMode: "colour", textHue: near.hue, textShade: near.shade, textHex: typed });
            }}
            onCancel={() => before.current && onPick(before.current)}
          />
        )}
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
        onHue={(textHue) => onPick({ textMode: "colour", textHue, textHex: null })}
        onShade={(textShade) => onPick({ textMode: "colour", textShade, textHex: null })}
        names={["Text hue", "Text shade"]}
        resting={mode !== "colour"}
        onWake={() => onPick({ textMode: "colour" })}
      />
    </div>
  );
}
