# Reel Cover Maker

Type a title, get an Instagram reel cover or grid post as a 1080-wide PNG.
Next.js 16 (App Router, TypeScript strict), no other dependencies but
Phosphor icons. See [README.md](README.md) for what it does and why.

## Commands

```
npm run dev
npm run check   # typecheck, lint, tests: keep all three clean
npm run build
```

## Rules

- **The site carries a copy.** eshaanm.net (repo `emehta/personal-hub`,
  cloned at `~/Desktop/Viate Website`) serves `src/components/reel-cover-maker/` at
  `/projects/reel-cover-maker`, plus `scripts/reel-cover.test.mjs`. Edit
  here, copy both across, and keep them byte for byte identical. The pages
  (`src/app/page.tsx` here, `src/app/projects/reel-cover-maker/page.tsx`
  there) differ and are not copies.
- **Pure on one side, the browser on the other.** `formats`, `title`,
  `layout`, `scene`, `palettes`, `grain`, `save` and `design` never touch the
  DOM and are tested in `scripts/reel-cover.test.mjs`. `paint` takes a
  context, so it is tested with a recording stand-in. `fonts`, `theme` and the
  component are the browser.
- **One scene, every canvas.** The preview, the thumbnails and the download
  are all drawn from `buildScene`. Never draw a second way for one of them.
- **Text stays in the safe area.** A new style or size must keep every word
  inside `format.safe`; the tests set every style over 410 titles and fail if
  one leaves it. Ornament (Echo's outlines, Glow's lights) may run to the
  edges.
- **Nothing is drawn before its faces load.** A canvas draws in whatever face
  is loaded at the time, and so would the download.
- **No em or en dashes** anywhere: copy, comments, docs, commits. The tests
  fail on one in the component folder.
- Read the guide in `node_modules/next/dist/docs/` before relying on a
  Next.js API from memory: this version differs from older ones.
