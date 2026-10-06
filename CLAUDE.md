# Reel Cover Maker

Type a title, get an Instagram reel cover or grid post as a 1080-wide PNG.
Next.js 16 (App Router, TypeScript strict), no other dependencies but
Phosphor icons, exported as a static site to GitHub Pages:
https://emehta.github.io/reel-cover-maker/. See [README.md](README.md) for
what it does and why.

## Commands

```
npm run dev
npm run check   # typecheck, lint, tests: keep all three clean
npm run build   # the static site, in out/
```

## Rules

- **It is a static site.** `output: "export"`, deployed by
  `.github/workflows/pages.yml` on every push to `main`, after
  `npm run check`. No server features: no route handlers, `headers()`,
  rewrites, middleware or the default `next/image` loader, which an export
  cannot do. The base path comes from `PAGES_BASE_PATH` at build time; never
  hard-code `/reel-cover-maker` in a URL. It is no longer served by
  eshaanm.net, which only redirects to it.
- **Pure on one side, the browser on the other.** `formats`, `title`,
  `layout`, `liquid-layout`, `collage`, `liquid`, `liquid-render`,
  `stepped`, `noise`, `strokes`, `scene`, `colour`, `palettes`, `grain`,
  `save`, `design` and `font-gate` never touch the DOM and are tested in `scripts/reel-cover.test.mjs`. `paint` takes a
  context, so it is tested with a recording stand-in. `fonts`, `theme` and the
  component are the browser.
- **One scene, every canvas.** The preview, the thumbnails and the download
  are all drawn from `buildScene`. Never draw a second way for one of them.
- **Text stays in the safe area.** A new style or size must keep every word
  inside `format.safe`; the tests set every style over hundreds of titles and
  fail if one leaves it. Ornament (Echo's outlines, the paste's droplets)
  may run to the edges.
- **The liquid styles are paste, not a font.** `liquid-layout.ts` seeds
  each word and letter from its own text (a word is drawn the same wherever
  it goes), `liquid.ts` makes the beads, `liquid-render.ts` the field, in
  the worker. Keep all three pure: the tests run them in node. The stroke
  fonts in `strokes/` are generated (Drip by `scripts/drip-font.mjs`, the
  Hershey fonts by `scripts/extract-strokes.mjs`); never edit them by hand,
  and keep their licence notes beside them.
- **Geometry in the worker, light on the GPU.** The worker makes a field
  per title and canvas; `liquid-gl.ts` lights it at paint time, so a colour
  or ground change is light again and never paste again. `shadeField` in
  `liquid-render.ts` is the same light for a browser without WebGL 2 and for
  the tests: change both together, line for line.
- **Letters keep their gap.** Paste swells, so after layout each letter is
  kerned by its own beads (drips included) to exactly its gap, and each line
  to its gap from the one above (`kernBy`, `dropBy` in scene.ts). Only a
  pair the style lets touch (`merge`) meets, and then exactly, so the smooth
  union bridges it; the tests fail if any two neighbouring letters' beads
  overlap, or a line runs into the next.
- **A layer is known by its paste** (`pasteKey`), never its colours and
  never the title: a layer made before a face arrived is otherwise reused
  where the paste no longer is.
- **Every random choice is seeded by the title and the shuffle** (`seed`),
  never `Math.random` in a scene: the preview must be exactly what
  downloads, until Shuffle is pressed.
- **The preview canvas's size is set only where it is painted**, never as a
  React prop: React resizing it clears it, and the last picture must stay
  up until the next is ready.
- **Nothing is drawn before its faces load.** A canvas draws in whatever face
  is loaded at the time, and so would the download. `font-gate.ts` keeps the
  record of which characters have loaded; never gate on
  `document.fonts.check`, which Chrome answers true for an installed family.
- **Text is placed by its ink.** `Measurer.bounds` gives the overhang past
  each end (italics, wide accents, emoji), and lines are fitted and placed
  with it. A test measurer that overhangs keeps that honest.
- **No em or en dashes** anywhere: copy, comments, docs, commits. The tests
  fail on one in the component folder.
- Read the guide in `node_modules/next/dist/docs/` before relying on a
  Next.js API from memory: this version differs from older ones.
