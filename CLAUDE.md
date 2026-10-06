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
  `layout`, `scene`, `palettes`, `grain`, `save`, `design` and `font-gate`
  never touch the DOM and are tested in `scripts/reel-cover.test.mjs`. `paint` takes a
  context, so it is tested with a recording stand-in. `fonts`, `theme` and the
  component are the browser.
- **One scene, every canvas.** The preview, the thumbnails and the download
  are all drawn from `buildScene`. Never draw a second way for one of them.
- **Text stays in the safe area.** A new style or size must keep every word
  inside `format.safe`; the tests set every style over 410 titles and fail if
  one leaves it. Ornament (Echo's outlines, Glow's lights) may run to the
  edges.
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
