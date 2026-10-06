# Reel Cover Maker

Type a title and get an Instagram reel cover or grid post, made to read in
the profile grid, ready to download.

Use it at **[emehta.github.io/reel-cover-maker](https://emehta.github.io/reel-cover-maker/)**.

## Using it

The controls are on the left, the cover on the right (on a phone, the cover
on top, so it stays in sight while you type).

- **Type the title.** It is set as large as the cover allows. A line break
  you type is kept.
- **Put a word between stars** to make it Stickery's funky word:
  `How I *actually* save`. Every other style sets a starred word as it sets
  the rest.
- **Pick a style** from the row of thumbnails, scrolled sideways: Stickery,
  Pasty, Pasty Flat, Editorial, Echo and Mono. Each thumbnail is your title
  in that style, cropped to the 3:4 window the profile grid shows, so you
  choose by how it will look on your grid.
  - **Stickery**: each line you type is a sticker with stepped, cut paper
    edges, in turn the colour and one a hundred degrees round the colour
    wheel from it (pink, then blue, as Main Sticker 2's), with a border that
    shows on either background. No side runs straight from corner to corner.
    Starred words are funky, the rest plain; with no stars, each sticker's
    longest word is the funky one. The funky word is set first, turned to an
    angle of its own, and the plain words are fitted round it as one unit:
    those before it dropped onto it word by word, those after it lifted up
    under it, each until it comes a small, random distance from the funky
    word's actual strokes, so "do what you" settles along the top of "want",
    each word at its own height, without ever touching. Plain words are
    never turned, and a line still reads in order. Above the funky word,
    each word settles onto what is under it, within 0.9 of an x-height of
    the others, and bobs a little, as Main Sticker 1's "do what you" does;
    below it, the line sits level, as Main Sticker 2's "they seem" does. A
    word space opens (to half again its width) where a stroke of the funky
    word reaches into the line, so a t can drop between two words. The plain
    words are sized against the funky word's x-height, a share of it each
    lettering sets, and a long line is made smaller to stay within the funky
    word's width. The funky lettering, picked from the Lettering list, is a
    brush script typeface (Yesteryear, Leckerli One or Damion) or drawn:
    Goo, liquid letters running into each other after Main Sticker 2's
    "aren't", in a hand of its own, as a teardrop (its ends swelling slowly
    into long drops, the last t's crossbar into an oval one) or evened out
    (the same, but no stroke swells past a third more than its weight and no
    foot ends in a ball). The plain words, picked from the Plain words list,
    are set in Outfit or Jost, or the serifs Fraunces or Newsreader.
  - **Pasty**: drippy hand lettering squeezed out in glossy gel, like
    sriracha from a bottle. Tall letters, their case mixed as a sign
    painter's hand mixes it, thin strokes that bow and sway and swell into
    blobs, stems whose feet run on as drips. Letters keep a thin gap, now
    and then touching so their gel bridges, and tuck under each other's
    arms; lines nest into each other.
  - **Pasty Flat**: the same lettering in thick, matte paste spread with a
    knife.
  - **Editorial**, **Echo** and **Mono**: a big serif, wide capitals echoed in
    outline, and a typewriter with its cursor.
- **Shuffle** draws the letters another way: every random choice a style
  makes (each letter's hand, the drips, where the stickers sit) is seeded by
  the title and the shuffle together, so what you see is exactly what
  downloads, until you shuffle again.
- **Pick a colour** with two sliders: the hue, and the shade from near-black
  to near-white. The colour is the letters' (the paste, the ink, the
  sticker). Dragging a slider only lights the paste again, so it keeps up
  with your finger.
- **Pick the background**, light or dark, with the two buttons over the
  cover.
- **Pick a size**: a reel cover (9:16), or a post at 3:4 or 4:5.
- **Grid crop** dims what the profile grid cuts off.
- **Download** (or Cmd/Ctrl+S). On an iPhone or iPad the button reads **Save
  image** and opens the share sheet, where **Save Image** puts the cover in
  Photos. Android downloads it, and Instagram's picker finds it there.
  Inside an app's own browser (Instagram's, when the link is opened from a
  bio), the cover opens on its own: press and hold it to save it.

The title, style, colour, background, size and shuffle are remembered in
this browser, so the next cover matches the last one.

To use it as a reel's cover: when posting, tap **Edit cover**, then **Add
from camera roll**. In Instagram's settings, **Data usage and media quality →
Upload at highest quality** keeps Instagram from compressing it further.

## Sizes

| Size | Pixels | What Instagram shows of it |
| --- | --- | --- |
| Reel cover | 1080 × 1920 (9:16) | All of it in Reels; a centred 4:5 window (1080 × 1350) in the feed; a centred 3:4 window (1080 × 1440) on the profile grid |
| Post 3:4 | 1080 × 1440 | All of it, on the grid too: the tallest post Instagram takes |
| Post 4:5 | 1080 × 1350 | All of it in the feed; on the grid, a centred 3:4 window less a strip each side (1012 × 1350) |

The profile grid has shown every post through a 3:4 window since January
2025 (it was square before), and Instagram has taken 3:4 photos natively
since May 2025.
[socialk.it](https://socialk.it/en/sizes/instagram-reel-size) and
[Neal Schaffer](https://nealschaffer.com/instagram-post-size/) give the crops.

Text is set only where every window agrees, 86 pixels in from its edges, so
nothing a cover says is cut off wherever it appears.

### Why these choices

- **1080 wide, exactly.** Instagram serves pictures 1080 wide. A wider file
  is only shrunk again, by Instagram's resampler rather than yours.
- **PNG.** Lossless, so Instagram's own JPEG encoding is the only one the
  cover goes through. sRGB, which is what a canvas draws in.
- **Grain in 2 × 2 cells.** Instagram's encoder smears single-pixel noise
  into blotches; grain two pixels across survives it and still reads as fine
  on a phone.
- **Colours that differ in lightness, not just hue.** Instagram stores colour
  at half resolution (4:2:0 chroma), so letters on a ground of the same
  lightness fringe at every edge. The sliders leave the choice to you, and
  the page says so under them when the letters fall below 3:1 against the
  background. The sliders work in OKLCH, so equal steps look equal and a
  shade is as light at every hue; a sticker's or a highlight's words are
  black or white, whichever reads, and the tests hold them to 4.5:1 at every
  hue and shade.

## How it works

A cover is a list of things to draw, built by pure functions and drawn on a
canvas, so the preview, the style thumbnails and the download are drawn from
the same list and cannot disagree.

### The liquid letters

Pasty, Pasty Flat and Stickery's liquid words are not a font. They are paste,
drawn from scratch for every title:

1. **Centre lines.** Each letter comes from a single-line font: its glyphs
   are strokes, not outlines, the line a nozzle of paste would follow.
   Pasty draws in Drip, a hand drawn for it (`scripts/drip-font.mjs`): tall,
   narrow, no serifs, curves where a pen would rule a line. Stickery's Goo
   draws in Goo (`scripts/goo-font.mjs`): a wide, round, running lowercase,
   its capitals and marks borrowed from Drip.
2. **A dynamic font.** Every word is seeded by its own text and the
   shuffle; every letter by its word and its place in it, which picks its
   size, lean, rise, squash, and whether it is drawn in its other case. So a
   K is drawn one way in "kite" and another in "handkerchief", and the same
   way every time either is typed.
3. **The hand.** Each stroke is bowed off its chord, and a glyph's strokes
   sway together as they run down it, so no stem is ruled straight.
4. **Paste.** Each stroke becomes a chain of beads, each a point with a
   radius: thin through its run, swelling and pinching with the pressure, a
   free end swelling into a blob. A stem's foot may run on as a drip: in the
   stem's direction at first, then straight down, thinning to a neck and
   ending in a drop, stopping short of the next line's ink. The paste's
   thickness follows the letter's size, never its stretch, so a tall letter
   keeps its counters open.
5. **Kerning by paste.** Paste swells, so each letter is moved to exactly
   its gap from its neighbours, bead by bead: tucked under an arm as far as
   the paste allows, never touching, except now and then a pair let meet so
   their paste bridges. Lines come to their gap from the line above, rising
   into the room between its letters. Words keep their space, ink to ink.
6. **Shape.** Each chain is the union of tapered capsules between its beads,
   measured as an exact signed distance. Chains join by a smooth union, so
   where strokes meet the paste pools into a fillet, as liquid does.
7. **Height.** How deep a pixel sits inside its stroke, against the radius
   at that point of it, is how high the paste stands: a round tube of gel
   whose blobs stand taller (Pasty), or paste of one thickness with a
   rounded shoulder, broad knife swaths, a ridge here and there, soft lumps
   and a ragged edge (Pasty Flat). A gel's radius is smoothed across the
   paste first, so where a stroke swells into a ball the surface swells
   with it, with no crease across the neck.
8. **Light, on the GPU.** The field (depth, height, colour, tone) is lit in
   a WebGL 2 shader every time a canvas is painted. Gel reflects a studio:
   a large softbox, a strip light, the room and the table, by Fresnel, so
   it catches the light at its shoulders as gel does, over a body that
   absorbs more the thicker it is. Its shadow is traced across the paste's
   real height toward the light and is a soft stain of its colour, as light
   through gel is. Matte paste has soft light, its own ridges' shadows, a
   satin sheen and a grey shadow. A letter's edge is a pixel and a half of
   smooth ramp, blended in the display's own values as type is, so a pale
   paste on the dark ground never steps. Without WebGL 2 the same light is
   worked out on the page (`shadeField`).
9. **Off the page's thread.** The field is made in a web worker, a few
   hundred milliseconds at full size, the preview first and then the
   thumbnails; a newer title replaces an older one still waiting. If the
   worker fails or stops answering, the page makes it itself. Fields are
   kept up to a budget in bytes, known by their paste and never by their
   colour, so a colour change makes nothing again and a field is never
   drawn where paste that has since moved used to be.

Stickery's stickers follow the ink itself: every plain word and typeface
word as thin upright strips of its letters' ink (read from the canvas a
twenty-fifth of an em at a time), every drawn letter bead by bead, each
padded and snapped out to a grid, with holes filled, gaps a cell wide
closed and pieces joined, traced as a polygon of straight steps. So the
steps climb a leaning stroke and step round an ascender, a swash's ball
and the end of a line. The grid is the lettering's: about half the plain
x-height under a script, for Main Sticker 1's chunky steps, a third of it
under Goo, for Main Sticker 2's fine staircase. The cells are shorter than
they are wide, as a sticker's rises are shorter than its runs. A seeded
pass then cuts a stair a cell out (from part way along to the nearer end)
into any straight run longer than five x-heights and into each piece's
outer sides left all but straight, so no side is ruled; a step only adds
paper, so no letter is ever uncovered. The grid, the
padding and the space between stickers scale with the words, and a long
line wraps inside its sticker. Goo's thick and thin comes from the pen
(`penWeights` in `liquid.ts`): heavy going down, lighter going up, thinnest
where a stroke turns back, all smoothed along the stroke so it never steps.
Only the plain face chosen is loaded.

| File | What it does |
| --- | --- |
| `formats.ts` | The three sizes, Instagram's crop windows, and the safe area they agree on |
| `title.ts` | What was typed, as lines and words, with stars read as emphasis (Stickery's funky words) |
| `layout.ts` | `flow` sets lines at one size, balanced, as large as the box allows |
| `liquid-layout.ts` | The liquid letters' hands, seeds, cases and spacing, and lines packed to fill their block |
| `liquid.ts` | A letter's paste: the hand's bow and sway, beads, pressure, blobs, drips and droplets |
| `liquid-render.ts` | The paste as a field (distance fields, smooth union, height), and its light worked out on the page |
| `liquid-gl.ts` | The same light, in a WebGL 2 shader |
| `liquid.worker.ts`, `liquid-client.ts` | The worker that makes the fields, and the page's queue and lighting of them |
| `strokes/` | The single-line fonts, Drip and Goo, from `scripts/drip-font.mjs` and `scripts/goo-font.mjs`, with their licences |
| `stepped.ts` | Stickery's stepped sticker outline |
| `scene.ts` | Each style, as a list of fills, grain, shapes, text and liquid layers |
| `Dropdown.tsx` | The Lettering and Plain words lists: a select of the maker's own, each option in its own type |
| `paint.ts` | Draws a scene on a canvas at any scale, from any origin |
| `colour.ts`, `palettes.ts` | The sliders' colours in OKLCH, the roles a style reads, and WCAG contrast |
| `noise.ts`, `grain.ts` | Seeded randomness, smooth noise, and film grain |
| `fonts.ts`, `font-gate.ts` | The web faces, served by next/font, and whether every character of the title has its file yet |
| `save.ts` | The file's name, and download or share sheet or press and hold |
| `design.ts` | What the browser remembers |
| `theme.ts` | Light and dark, after the system, from the first frame |

Nothing is drawn until every character of the title has its face's file,
because a canvas draws in whatever face is there at that moment, and the file
would be set in a fallback. The maker keeps its own record of what has
loaded rather than asking `document.fonts.check`, which Chrome answers yes to
for any family installed on the computer. A character no stroke font can
draw (an emoji) is set as plain text in the liquid styles, so nothing typed
is lost.

The web typefaces are Instrument Serif, Inter Tight, Archivo Black and Space
Mono, from Google Fonts under the SIL Open Font License, served from the
page's own origin. The stroke fonts' licences are in
`src/components/reel-cover-maker/strokes/LICENSE.md`.

## Development

```
npm run dev        # http://localhost:3000
npm run check      # typecheck, lint and tests
npm test           # scripts/reel-cover.test.mjs
npm run build      # the static site, in out/
node scripts/drip-font.mjs         # Drip again, from its drawing
node scripts/goo-font.mjs          # Goo again (after Drip: it borrows its capitals)
```

No test framework: the tests are a plain `node` script that asserts and
exits non-zero (`scripts/alias-loader.mjs` lets it import by the `@/`
alias). They set every style over hundreds of titles in every size and hold
every word's ink to the safe area (the paste bead by bead, with a stand-in
measurer whose italics, accents and emoji overhang), count every word and
letter back, and check: that no larger size that fits was passed over; that
letters keep their gap and touch only now and then; that a word is drawn the
same wherever it goes, and the hand mixes its cases at about the rate it
should; that drips stay above their floor; that a tapered capsule's distance
matches the slow way of working it out; that two strokes pool when close and
stay apart when not; that paste shades the ground away from the light, gel's
shadow in its colour, and the layer's edge is exactly the ground; that only
Stickery reads the stars; that a t's swash grows out of its bar as paste
does and Goo Even never swells past its weight; that the shuffle moves
things and the same seed does not; that a sticker is straight steps on its
grid round every letter, with a border that shows on either ground; the
sliders' colours at every hue and shade; the font gate with loads that
arrive late or never; the grain, the file names, the save method, and that
the painter draws each word where the scene put it. Node strips the types
from a `.ts` file on its own, so a module the tests load must write
type-only imports as `import type`.

## Hosting

A static site on GitHub Pages, free. `next build` writes plain files to
`out/` (`output: "export"`), and `.github/workflows/pages.yml` runs the
checks, builds and publishes on every push to `main`; a pull request is
checked by `ci.yml`. Nothing runs on a server.

The workflow asks Pages where the site is served and builds for that
(`PAGES_BASE_PATH`), so moving it to a domain of its own needs no code
change: add the domain under the repo's Settings, Pages, and a CNAME record
for it pointing at `emehta.github.io`. Pages cannot send response headers,
so there are none beyond its own.

`eshaanm.net/projects/reel-cover-maker`, where it was first served,
redirects here.
