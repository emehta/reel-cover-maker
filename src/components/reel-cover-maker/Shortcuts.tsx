"use client";

import { Question } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";

interface Props {
  /** A Mac, iPhone or iPad: Cmd's glyphs rather than Ctrl's names. */
  apple: boolean;
  /** What saving the cover is called here: Download, or Save image where it is shared. */
  saveLabel: string;
}

/** Whether a key pressed in `target` is being typed: a ? there is a ? in the words, not a call for this card. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('textarea, input:not([type="range"]):not([type="radio"]):not([type="checkbox"]), [contenteditable]:not([contenteditable="false"]), [role="listbox"]');
}

/**
 * The keyboard's shortcuts, folded behind a ? beside Download (the owner's
 * ask, 7 Oct): a card under it, opened by the button or by ? from anywhere
 * but a text field, closed by either again, by Escape or by a press
 * anywhere else. Not on a touch screen, which has no keys to show.
 */
export function Shortcuts({ apple, saveLabel }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && open) {
        // Claimed first, so the Escape that closes the card leaves the phone view as it is.
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing(event.target)) {
        event.preventDefault();
        setOpen((on) => !on);
      }
    };
    const onDown = (event: PointerEvent) => {
      if (open && !wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  const mod = apple ? "⌘" : "Ctrl+";
  const rows: { name: string; note?: string; keys: string[] }[][] = [
    [
      { name: "Bold the selected words", note: "In Stickery, bold words get the funky lettering", keys: [`${mod}B`] },
      { name: "Undo", keys: [`${mod}Z`] },
      { name: "Redo", keys: [apple ? "⇧⌘Z" : "Ctrl+Shift+Z"] },
      { name: saveLabel, keys: [`${mod}S`] },
    ],
    [
      { name: "Move the selected text", note: "With Shift, ten times as far", keys: ["←", "↑", "→", "↓"] },
      { name: "Scale it", keys: ["+", "−"] },
      { name: "Turn it", keys: ["[", "]"] },
      { name: "Let go of it", keys: ["Esc"] },
    ],
    [
      { name: "Leave the phone view", keys: ["Esc"] },
      { name: "Show these shortcuts", keys: ["?"] },
    ],
  ];

  return (
    <div className={styles.shortcuts} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.tool} ${styles.tip} ${styles.helpButton}`}
        onClick={() => setOpen((on) => !on)}
        aria-expanded={open}
        aria-controls={cardId}
        aria-label="Keyboard shortcuts"
        aria-keyshortcuts="Shift+?"
        data-tip="Keyboard shortcuts  ?"
        data-open={open || undefined}
      >
        <Question size={18} weight="bold" aria-hidden="true" />
      </button>
      <div id={cardId} className={styles.shortcutsCard} hidden={!open} role="region" aria-label="Keyboard shortcuts">
        <p className={styles.shortcutsTitle}>Keyboard shortcuts</p>
        {rows.map((group, gi) => (
          <dl key={gi} className={styles.shortcutsGroup}>
            {group.map((row) => (
              <div key={row.name} className={styles.shortcut}>
                <dt>
                  {row.name}
                  {row.note && <span className={styles.shortcutNote}>{row.note}</span>}
                </dt>
                <dd>
                  {row.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </div>
  );
}
