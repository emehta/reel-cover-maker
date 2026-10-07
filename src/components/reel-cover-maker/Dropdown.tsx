"use client";

import { CaretDown, Check } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** The option drawn in its own type, as a CSS font: a typeface's name shown in the typeface. */
  font?: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Small, in a row of other controls: its label inside the button, before the choice, and the choice's type at the button's size. */
  compact?: boolean;
}

/** A CSS font at another size: an option's own type, in the button. */
const atSize = (font: string, px: number) => font.replace(/\d+(\.\d+)?px/, `${px}px`);

/** How far the list stands off its button, and off the window's edges, in pixels. */
const GAP = 6;
const MARGIN = 8;

/**
 * The list placed against the window: under its button, or over it where
 * there is no room under it, as wide as the button or wider, kept inside
 * the window. False, and nothing placed, when the button is off the screen.
 */
function place(button: HTMLElement | null, list: HTMLElement | null): boolean {
  if (!button || !list) return false;
  const rect = button.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  const width = Math.max(rect.width, 200);
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN));
  const height = list.scrollHeight;
  const below = window.innerHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  const up = height > below && above > below;
  list.style.left = `${left}px`;
  list.style.width = `${width}px`;
  list.style.maxHeight = `${Math.max(120, up ? above : below)}px`;
  list.style.top = up ? "auto" : `${rect.bottom + GAP}px`;
  list.style.bottom = up ? `${window.innerHeight - rect.top + GAP}px` : "auto";
  list.style.visibility = "visible";
  return true;
}

/**
 * A select of the maker's own: a button showing the choice, and a list of
 * them under it (or over it, where the window has no room below), each in
 * its own type. It works as a select does from the keyboard: the arrows,
 * Home and End move through the list, a letter jumps to the next option it
 * starts, Enter or Space chooses, Escape and Tab close. The list is placed
 * against the window, not the panel, so a panel that scrolls never clips
 * it, and moves with its button when anything scrolls.
 */
export function Dropdown<T extends string>({ label, value, options, onChange, compact = false }: Props<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selected];

  const show = (at: number) => {
    setActive(at);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const choose = (at: number) => {
    const option = options[at];
    if (option && option.value !== value) onChange(option.value);
    close(true);
  };

  // Placed once the list is drawn and can be measured, before it is
  // painted, and again whenever the page moves under it.
  useLayoutEffect(() => {
    if (!open) return;
    if (place(buttonRef.current, listRef.current)) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // The active option kept in sight as the keys move through a long list,
  // by scrolling the list alone: scrolling it into view would move the page
  // too, which closes the list.
  useEffect(() => {
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!open || !list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [open, active]);

  // Closed by a press anywhere else. Kept with its button as the page
  // scrolls or the window changes size, and closed once the button has
  // gone off the screen.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const moved = (event?: Event) => {
      if (event && listRef.current?.contains(event.target as Node)) return;
      if (!place(buttonRef.current, listRef.current)) setOpen(false);
    };
    const scrolled = moved;
    const resized = () => moved();
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resized);
    };
  }, [open]);

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(selected);
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.max(0, Math.min(last, to)));
    };
    switch (event.key) {
      case "ArrowDown":
        return move(active + 1);
      case "ArrowUp":
        return move(active - 1);
      case "Home":
      case "PageUp":
        return move(0);
      case "End":
      case "PageDown":
        return move(last);
      case "Enter":
      case " ":
        event.preventDefault();
        return choose(active);
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        return close(true);
      case "Tab":
        return close(false);
      default: {
        // A letter: the next option starting with it, from the one after the active.
        if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
        const key = event.key.toLowerCase();
        for (let step = 1; step <= options.length; step += 1) {
          const at = (active + step) % options.length;
          if (options[at].label.toLowerCase().startsWith(key)) return move(at);
        }
      }
    }
  };

  return (
    <div className={compact ? `${styles.dropdown} ${styles.dropdownCompact}` : styles.dropdown}>
      <span className={compact ? styles.dropdownPrefixHidden : styles.label} id={labelId}>
        {label}
      </span>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={styles.dropdownButton}
        title={compact ? label : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${buttonId}`}
        onClick={() => (open ? close(false) : show(selected))}
        onKeyDown={onButtonKey}
      >
        {compact && (
          <span className={styles.dropdownPrefix} aria-hidden="true">
            {label}
          </span>
        )}
        <span className={styles.dropdownValue} style={current?.font ? { font: compact ? atSize(current.font, 15) : current.font } : undefined}>
          {current?.label}
        </span>
        <CaretDown size={14} weight="bold" aria-hidden="true" className={styles.dropdownCaret} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={`${id}-option-${active}`}
          className={styles.dropdownList}
          onKeyDown={onListKey}
        >
          {options.map((option, i) => (
            <li
              key={option.value}
              id={`${id}-option-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === selected}
              className={styles.dropdownOption}
              data-active={i === active || undefined}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span style={option.font ? { font: option.font } : undefined}>{option.label}</span>
              {i === selected && <Check size={16} weight="bold" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
