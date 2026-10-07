/**
 * What was typed, read as the lines and words a cover sets.
 *
 * Bold marks emphasis: "actually" made bold in the Text field (Cmd+B, or
 * its B button) is Stickery's funky word; every other style sets it as it
 * sets the rest. It is kept as markup, a pair of stars round it, as in a
 * chat app: `how I *actually* save`. A star or a backslash typed as one is
 * kept as `\*` or `\\`, and a star with no partner is only a star. A
 * line break typed is a line break kept; blank lines and runs of spaces
 * fold away, because a cover has no room for them.
 *
 * The field shows the words, never the stars: `readMarked` and
 * `writeMarked` go between the markup and the text with its bold, and
 * `editMarked`, `toggleBold` and `convertStars` are what the field does to
 * it as it is typed in.
 */

export interface Segment {
  text: string;
  emphasis: boolean;
}

/** One word: the segments between two spaces, emphasis able to change inside it. */
export type Word = Segment[];

/** One typed line, as words. */
export type Paragraph = Word[];

/** The longest title the field takes. A cover is read at a glance, in a grid. */
export const MAX_TITLE_LENGTH = 140;

/** What the preview shows before anything is typed. */
export const PLACEHOLDER_TITLE = "Type your *title*";

/** Line endings made "\n", runs of spaces and tabs one space, and blank lines gone. */
export function tidyTitle(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t   -​　]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** The text as typed, and which of its characters (UTF-16 units, as a text field counts them) are bold. */
export interface Marked {
  text: string;
  marks: boolean[];
}

/** The markup read: its stars as bold, a `\*` or `\\` as the character itself. The stars pair up from the left; an odd one out is a literal star. */
export function readMarked(raw: string): Marked {
  const chars: { c: string; star: boolean }[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === "\\" && (raw[i + 1] === "*" || raw[i + 1] === "\\")) {
      chars.push({ c: raw[i + 1], star: false });
      i += 1;
    } else chars.push({ c, star: c === "*" });
  }
  const stars = chars.flatMap((t, i) => (t.star ? [i] : []));
  const pairs = new Set(stars.slice(0, stars.length - (stars.length % 2)));
  let on = false;
  let text = "";
  const marks: boolean[] = [];
  chars.forEach((t, i) => {
    if (pairs.has(i)) {
      on = !on;
      return;
    }
    text += t.c;
    marks.push(on);
  });
  return { text, marks };
}

/** The text with its bold, as markup: a star where bold starts and ends, a typed star or backslash escaped. */
export function writeMarked(text: string, marks: readonly boolean[]): string {
  let out = "";
  let on = false;
  for (let i = 0; i < text.length; i += 1) {
    const m = marks[i] === true;
    if (m !== on) {
      out += "*";
      on = m;
    }
    const c = text[i];
    out += c === "*" || c === "\\" ? `\\${c}` : c;
  }
  return on ? `${out}*` : out;
}

/** The markup held to `max` characters of text, never cutting a letter from its other half. */
export function clipMarked(raw: string, max: number): string {
  const { text, marks } = readMarked(raw);
  if (text.length <= max) return raw;
  let end = max;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return writeMarked(text.slice(0, end), marks.slice(0, end));
}

/**
 * The text field's text changed to `after`, its caret at `caret`: the bold
 * carried over. What was typed is the change ending at the caret, and is
 * bold as `typing` says, where Cmd+B was pressed with nothing selected;
 * else as the first character it replaced; else bold inside bold, and
 * bold straight after a bold word (its end typed on) but never across a
 * space, since bold is a funky word, and the next word typed is a word of
 * its own.
 */
export function editMarked(before: Marked, after: string, caret: number, typing: boolean | null = null): Marked {
  const a = before.text;
  const b = after;
  const at = Math.max(0, Math.min(b.length, caret));
  let s = 0;
  while (s < a.length && s < b.length - at && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;
  let p = 0;
  while (p < a.length - s && p < b.length - s && a[p] === b[p]) p += 1;
  const removed = a.length - p - s;
  const inserted = b.length - p - s;
  const typed = b.slice(p, p + inserted);
  const space = (c: string | undefined) => c !== undefined && /\s/.test(c);
  const carried = (): boolean => {
    if (removed > 0) return before.marks[p] === true;
    const prev = p > 0 ? before.marks[p - 1] === true : false;
    const next = before.marks[p] === true;
    if (p === 0) return next && !space(typed[typed.length - 1]);
    if (prev && next) return true;
    return prev && !space(a[p - 1]) && !space(typed[0]);
  };
  const style = typing ?? carried();
  return { text: b, marks: [...before.marks.slice(0, p), ...new Array<boolean>(inserted).fill(style), ...before.marks.slice(a.length - s)] };
}

/** What Cmd+B does to a selection: bold all of it, unless every letter of it is bold already, when none of it is. */
export function toggleBold(marked: Marked, start: number, end: number): Marked {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(marked.text.length, Math.max(start, end));
  if (hi <= lo) return marked;
  const letters: number[] = [];
  for (let i = lo; i < hi; i += 1) if (!/\s/.test(marked.text[i])) letters.push(i);
  const all = (letters.length ? letters : Array.from({ length: hi - lo }, (_, k) => lo + k)).every((i) => marked.marks[i]);
  const marks = marked.marks.slice();
  for (let i = lo; i < hi; i += 1) marks[i] = !all;
  return { text: marked.text, marks };
}

/** Whether a selection reads as bold: every letter in it is (a caret, the letter before it). */
export function isBold(marked: Marked, start: number, end: number): boolean {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(marked.text.length, Math.max(start, end));
  if (hi <= lo) return lo > 0 ? marked.marks[lo - 1] === true : marked.marks[0] === true;
  let any = false;
  for (let i = lo; i < hi; i += 1) {
    if (/\s/.test(marked.text[i])) continue;
    any = true;
    if (!marked.marks[i]) return false;
  }
  return any || marked.marks.slice(lo, hi).every(Boolean);
}

/**
 * Words typed between stars, as they always could be, made bold the
 * moment the second star is typed, the stars gone: `*want*` reads as
 * **want**. A pair on one line whose words do not start or end with a
 * space, as in a chat app; any other star stays a star. With where each
 * old position now is, for the caret. Null when there is nothing to do.
 */
export function convertStars(marked: Marked): { marked: Marked; moved: (i: number) => number } | null {
  const { text } = marked;
  const gone = new Set<number>();
  let i = text.indexOf("*");
  while (i !== -1) {
    const j = text.indexOf("*", i + 1);
    if (j === -1) break;
    const inner = text.slice(i + 1, j);
    if (inner.length > 0 && !inner.includes("\n") && inner.trim() === inner) {
      gone.add(i);
      gone.add(j);
      i = text.indexOf("*", j + 1);
    } else i = j;
  }
  if (!gone.size) return null;
  const order = [...gone].sort((p, q) => p - q);
  let out = "";
  const marks: boolean[] = [];
  let inside = false;
  for (let k = 0; k < text.length; k += 1) {
    if (gone.has(k)) {
      inside = !inside;
      continue;
    }
    out += text[k];
    marks.push(inside || marked.marks[k] === true);
  }
  return { marked: { text: out, marks }, moved: (p) => p - order.filter((g) => g < p).length };
}

/** The text in runs of one weight, for a field to draw. */
export function boldRuns(marked: Marked): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = [];
  for (let i = 0; i < marked.text.length; i += 1) {
    const bold = marked.marks[i] === true;
    const last = runs[runs.length - 1];
    if (last && last.bold === bold) last.text += marked.text[i];
    else runs.push({ text: marked.text[i], bold });
  }
  return runs;
}

/** Which characters of `text` are emphasised, with the stars that marked it removed. */
function emphasise(raw: string): Segment[] {
  return boldRuns(readMarked(raw)).map((run) => ({ text: run.text, emphasis: run.bold }));
}

/** Split segments into words at every space or line break, keeping emphasis. */
export function parseTitle(raw: string): Paragraph[] {
  const paragraphs: Paragraph[] = [[]];
  let word: Word = [];

  const endWord = () => {
    if (word.length) paragraphs[paragraphs.length - 1].push(word);
    word = [];
  };

  for (const segment of emphasise(tidyTitle(raw))) {
    const parts = segment.text.split(/(\n| )/);
    for (const part of parts) {
      if (part === " ") {
        endWord();
      } else if (part === "\n") {
        endWord();
        paragraphs.push([]);
      } else if (part) {
        const last = word[word.length - 1];
        if (last && last.emphasis === segment.emphasis) last.text += part;
        else word.push({ text: part, emphasis: segment.emphasis });
      }
    }
  }
  endWord();
  return paragraphs.filter((paragraph) => paragraph.length > 0);
}

/** The title as plain words, stars gone: for the file name and the picture's description. */
export function plainTitle(raw: string): string {
  return parseTitle(raw)
    .map((paragraph) => paragraph.map((word) => word.map((s) => s.text).join("")).join(" "))
    .join(" ");
}

/** Whether the title has anything in it to set. */
export function hasTitle(raw: string): boolean {
  return parseTitle(raw).length > 0;
}

/** Every grapheme in `text`, so a word broken across lines never splits a letter from its accent or an emoji. */
export function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}
