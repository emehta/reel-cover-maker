"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { boldRuns, convertStars, editMarked, isBold, readMarked, toggleBold, writeMarked, type Marked } from "@/components/reel-cover-maker/title";

interface Props {
  id: string;
  /** The text as markup: bold between stars (title.ts). */
  value: string;
  onChange: (markup: string) => void;
  /** Undo and redo are the page's, so a change of text and a change of style come back in the order made. */
  onUndo: () => void;
  onRedo: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Shown, bold and all, while the field is empty. */
  placeholder: string;
  maxLength: number;
  /** Beside the field's label: what acts on the text as drawn (Shuffle). */
  side?: ReactNode;
  /** Under the field: a note the text needs (too long for the cover, a style that could not be drawn). */
  children?: ReactNode;
}

const subscribeNothing = () => () => {};
const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes("Mac OS");

/**
 * The Text field: the words as typed, with bold, which is Stickery's
 * funky words. Select words and press Cmd+B (Ctrl+B elsewhere) to make
 * them bold or plain again; with nothing selected, what is typed next is.
 * Words typed between stars turn bold as the second star goes in, as they
 * always did. No button for it: the owner asked for none (7 Oct).
 *
 * A textarea does the typing, so the keyboard, autocorrect, spelling and
 * the caret are the browser's own; its letters are drawn clear, and the
 * same letters are drawn over it in runs of plain and bold. Bold is drawn
 * by a stroke round the letters rather than a bolder face, which would be
 * wider and put every letter after it out of line with the caret.
 */
export function TextField({ id, value, onChange, onUndo, onRedo, inputRef, placeholder, maxLength, side, children }: Props) {
  const marked = readMarked(value);
  const mirrorRef = useRef<HTMLDivElement>(null);
  /** Cmd+B with nothing selected: whether what is typed at that caret is bold. */
  const typing = useRef<{ at: number; bold: boolean } | null>(null);
  /** Where the caret goes once the field shows a change the field did not type itself (stars taken out, an undo). */
  const pending = useRef<{ start: number; end: number } | null>(null);
  /** What this field last sent, to tell a change it made from one made elsewhere (an undo). */
  const sent = useRef(value);
  const shownText = useRef(marked.text);
  const apple = useSyncExternalStore(subscribeNothing, isApple, () => true);

  const send = (next: Marked) => {
    const markup = writeMarked(next.text, next.marks);
    sent.current = markup;
    onChange(markup);
  };

  /** What Cmd+B with nothing selected set holds only while the caret stays where it was pressed. */
  const readSelection = () => {
    const el = inputRef.current;
    const t = typing.current;
    if (el && t && (t.at !== el.selectionStart || el.selectionStart !== el.selectionEnd)) typing.current = null;
  };

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    const caret = el.selectionEnd;
    const grown = el.value.length - marked.text.length;
    const t = typing.current;
    // What Cmd+B set applies only to what is typed where it was pressed.
    const style = t && grown > 0 && caret - grown === t.at ? t.bold : null;
    typing.current = null;
    let next = editMarked(marked, el.value, caret, style);
    const composing = (event.nativeEvent as InputEvent).isComposing === true;
    const stars = composing ? null : convertStars(next);
    if (stars) {
      next = stars.marked;
      pending.current = { start: stars.moved(el.selectionStart), end: stars.moved(caret) };
    }
    send(next);
  };

  const toggle = () => {
    const el = inputRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    if (start === end) {
      const now = typing.current?.at === start ? typing.current.bold : isBold(marked, start, start);
      typing.current = { at: start, bold: !now };
      return;
    }
    pending.current = { start, end };
    send(toggleBold(marked, start, end));
  };

  const key = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = apple ? event.metaKey : event.ctrlKey;
    if (!mod || event.altKey) return;
    const k = event.key.toLowerCase();
    if (k === "b" && !event.shiftKey) {
      event.preventDefault();
      toggle();
    }
  };

  // The browser's own undo would bring back text without its bold: the page's is used instead, from the menu too.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const before = (event: InputEvent) => {
      if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return;
      event.preventDefault();
      if (event.inputType === "historyUndo") onUndo();
      else onRedo();
    };
    el.addEventListener("beforeinput", before);
    return () => el.removeEventListener("beforeinput", before);
  }, [inputRef, onUndo, onRedo]);

  // A change made elsewhere (an undo) puts the caret at its end; stars taken out keep it where it was in the words.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (value !== sent.current) {
      sent.current = value;
      if (document.activeElement === el) {
        const a = shownText.current;
        const b = el.value;
        let s = 0;
        while (s < a.length && s < b.length && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;
        pending.current = { start: b.length - s, end: b.length - s };
      }
    }
    shownText.current = el.value;
    if (pending.current) {
      el.setSelectionRange(pending.current.start, pending.current.end);
      pending.current = null;
    }
    if (mirrorRef.current) mirrorRef.current.scrollTop = el.scrollTop;
  }, [value, inputRef]);

  const empty = marked.text.length === 0;
  const runs = boldRuns(empty ? readMarked(placeholder) : marked);

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          Text
        </label>
        {side}
      </div>
      <div className={styles.textBox}>
        <textarea
          ref={inputRef}
          id={id}
          className={styles.input}
          value={marked.text}
          onChange={change}
          onKeyDown={key}
          onSelect={readSelection}
          aria-keyshortcuts={apple ? "Meta+B" : "Control+B"}
          onScroll={(event) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
          placeholder={readMarked(placeholder).text}
          maxLength={maxLength}
          rows={3}
          spellCheck
        />
        <div ref={mirrorRef} className={styles.mirror} data-empty={empty || undefined} aria-hidden="true">
          {runs.map((run, i) =>
            run.bold ? (
              <span key={i} className={styles.strong}>
                {run.text}
              </span>
            ) : (
              run.text
            ),
          )}
          {/* A last line break needs something after it to be a line. */}
          {"​"}
        </div>
      </div>
      {children}
    </div>
  );
}
