# Reel Cover Maker

Type a title and get an Instagram reel cover or grid post, made to read in
the profile grid, ready to download.

Use it at **[emehta.github.io/reel-cover-maker](https://emehta.github.io/reel-cover-maker/)**.

## Using it

- **Type the title.** It is set as large as the cover allows, wrapped into
  even lines. A line break you type is kept.
- **Put a word between stars** to make it stand out: `How I *actually* save`.
  Each style marks it its own way (italic, the accent colour, a label of its
  own, a highlight).
- **Pick a style.** Each thumbnail is your title in that style, cropped to the
  3:4 window the profile grid shows, so you are choosing by how it will look
  on your grid.
- **Pick a colour.** Every style uses the same palette, so covers made in one
  colour read as a set.
- **Pick a size**: a reel cover (9:16), or a post at 3:4 or 4:5.
- **Grid crop** dims what the profile grid cuts off.
- **Download** (or Cmd/Ctrl+S). On an iPhone or iPad the button reads **Save
  image** and opens the share sheet, where **Save Image** puts the cover in
  Photos. Android downloads it, and Instagram's picker finds it there.
  Inside an app's own browser (Instagram's, when the link is opened from a
  bio), the cover opens on its own: press and hold it to save it.

The title, style, colour and size are remembered in this browser, so the next
cover matches the last one.

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
  at half resolution (4:2:0 chroma), so red text on a blue of the same
  lightness fringes at every edge. The tests hold every palette's title
  colour to 7:1 against its ground, Glow's text to 4.5:1 over its lights
  everywhere text can go, and every label to 4.5:1.

## How it works

A cover is a list of things to draw, built by pure functions and drawn on a
canvas, so the preview, the style thumbnails and the download are drawn from
the same list and cannot disagree.

| File | What it does |
| --- | --- |
| `formats.ts` | The three sizes, Instagram's crop windows, and the safe area they agree on |
| `title.ts` | What was typed, as lines and words, with stars read as emphasis |
| `layout.ts` | `flow` sets lines at one size, balanced, as large as the box allows; `stack` sizes each line to run the full width, as a poster does |
| `scene.ts` | Each style, as a list of fills, lights, grain, boxes and text |
| `paint.ts` | Draws a scene on a canvas at any scale, from any origin |
| `palettes.ts` | The eight palettes and WCAG contrast |
| `grain.ts` | Seeded film grain, the same every time |
| `fonts.ts` | The faces, served by next/font, and the canvas measurer |
| `font-gate.ts` | Whether every character of the title has its face's file yet |
| `save.ts` | The file's name, and download or share sheet or press and hold |
| `design.ts` | What the browser remembers |
| `theme.ts` | Light and dark, after the system, from the first frame |

Nothing is drawn until every character of the title has its face's file,
because a canvas draws in whatever face is there at that moment, and the file
would be set in a fallback. The faces are split by script, so a title with
"Łódź" in it waits for the Latin Extended file. The maker keeps its own
record of what has loaded rather than asking `document.fonts.check`, which
Chrome answers yes to for any family installed on the computer.

Layout measures text in em through a `Measurer`, which is the canvas in the
browser and a stand-in in the tests. Lines are placed by their ink, not only
their advance, so an italic's lean, a wide accent or an emoji at the end of
a line stays inside the safe area.

The typefaces are Instrument Serif, Anton, Inter Tight, Archivo Black and
Space Mono, all from Google Fonts under the SIL Open Font License, served
from the page's own origin.

## Development

```
npm run dev        # http://localhost:3000
npm run check      # typecheck, lint and tests
npm test           # scripts/reel-cover.test.mjs
npm run build      # the static site, in out/
```

No test framework: the tests are a plain `node` script that asserts and exits
non-zero (`scripts/alias-loader.mjs` lets it import by the `@/` alias). They
set every style over 410 titles in every size and hold every word's ink to
the safe area (with a stand-in measurer whose italics, accents and emoji
overhang), count every word back, check that no larger size that fits was
passed over, check every palette's contrast (Glow's over its lights), drive
the font gate with loads that arrive late or never, and check the grain, the
file names, the save method and that the painter draws each word where the
scene put it. Node strips the types
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
