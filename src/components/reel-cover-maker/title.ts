/**
 * What was typed, read as the lines and words a cover sets.
 *
 * A pair of stars marks emphasis, as in a chat app: `how I *actually* save`
 * makes "actually" Stickery's funky word; every other style sets it as it
 * sets the rest. A star with no partner is only a star. A line break
 * typed is a line break kept; blank lines and runs of spaces fold away,
 * because a cover has no room for them.
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

/** Which characters of `text` are emphasised, with the stars that marked it removed. */
function emphasise(text: string): Segment[] {
  const stars: number[] = [];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "*") stars.push(i);
  // The stars pair up from the left; an odd one out is a literal star.
  const pairs = new Set(stars.slice(0, stars.length - (stars.length % 2)));

  const segments: Segment[] = [];
  let emphasis = false;
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    if (pairs.has(i)) {
      if (current) segments.push({ text: current, emphasis });
      current = "";
      emphasis = !emphasis;
      continue;
    }
    current += text[i];
  }
  if (current) segments.push({ text: current, emphasis });
  return segments;
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
