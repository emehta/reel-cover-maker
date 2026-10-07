# Reel Cover Maker

Type a title, over a photo if wanted, place it, get an Instagram reel cover
or grid post as a 1080-wide PNG.
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
  `layout`, `liquid-layout`, `liquid`, `liquid-render`, `stepped`, `noise`,
  `strokes`, `scene`, `colour`, `palettes`, `grain`, `save`, `design`,
  `photo`, `place` and `font-gate` never touch the DOM and are tested in
  `scripts/reel-cover.test.mjs`. `paint` takes a context, so it is tested
  with a recording stand-in. `fonts`, `theme`, `Dropdown`, `photo-gl`,
  `photo-store`, `Camera`, `PhotoControls`, `CoverSurface` and the
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
  fonts in `strokes/` are generated (Drip by `scripts/drip-font.mjs`, Goo
  by `scripts/goo-font.mjs`, which borrows Drip's capitals and marks, so run
  it again after changing Drip's); never edit them by hand, and keep their
  licence notes beside them.
- **Geometry in the worker, light on the GPU.** The worker makes a field
  per title and canvas; `liquid-gl.ts` lights it at paint time, so a colour
  or ground change is light again and never paste again. `shadeField` in
  `liquid-render.ts` is the same light for a browser without WebGL 2 and for
  the tests: change both together, line for line. An edge is blended in the
  display's values, not linear light, or a pale gel steps on the dark
  ground.
- **Letters keep their gap.** Paste swells, so after layout each letter is
  kerned by its own beads (drips included) to exactly its gap, and each line
  to its gap from the one above (`kernBy`, `dropBy` in scene.ts). Only a
  pair the style lets touch (`merge`) meets, and then exactly (or, in Goo,
  running into it by `overlap`), so the smooth union bridges it; a style
  with `clearMarks` keeps dots and marks a clear gap however its letters
  touch. Pasty's spacing is the one its covers were made with: a rule for
  Goo goes behind a flag of Goo's, or Pasty's lines break somewhere new.
- **A layer is known by its paste** (`pasteKey`), never its colours and
  never the title: a layer made before a face arrived is otherwise reused
  where the paste no longer is.
- **Stickery is one unit, fitted round its funky word, never touching.**
  The funky word is placed first and turned; plain words drop onto it (or
  rise under it) by `travel`, which measures against its real strokes
  (paste beads, or a typeface's ink strips), stopping a random, positive
  distance short. Above the funky word each word settles on its own,
  within 0.9 of an x-height of the others (0.35 in a line of two), and
  bobs a little, only ever away from the funky word; below it a line
  settles level; a word space may widen to let a funky stroke through.
  Words are never turned. Plain sizes come from the funky
  word's x-height and the lettering's `plain` share, measured from the
  references; a script with a small x-height for its em takes a larger
  share. A sticker is fitted by its paper and each turned funky word's
  whole box. Its outline traces the ink (strips and beads) on the
  lettering's own grid (`steps`); `stepped.ts` steps every long run and
  each piece's outer sides. The tests hold all of it over every lettering,
  face and shuffle.
- **Bold is Stickery's alone.** Bold is kept as stars in `design.text`
  (`readMarked`/`writeMarked` in title.ts, a typed star or backslash
  escaped); `buildScene` reads every other style's title with its bold as
  plain words (the owner's ask, 7 Oct): no accent colour, italic or
  highlight anywhere else.
- **The Text field draws its own letters.** `TextField.tsx` is a textarea
  whose letters are clear, under a mirror of the same text in plain and
  bold runs; bold is a text stroke, never a bolder weight, which would be
  wider and put the caret out of line. Keep the two set alike to the pixel
  (`.input, .mirror`). Cmd+B and the B button toggle bold (the button
  holds back mousedown, never pointerdown, which loses WebKit's tap);
  typing carries bold on by `editMarked` and never across a space; typed
  `*word*` pairs become bold by `convertStars`.
- **One undo for the whole cover** (`history.ts`): every `update` is a
  step unless told otherwise (a photo taken, which undo cannot bring back,
  seals instead), runs of the same fields within 800 ms are one step, and
  Cmd+Z in the Text field is this undo too (the browser's own would bring
  back text without its bold).
- **Spread is gone, with all of its own** (the collage, square knife ends,
  Hershey Sans and its package), at the owner's ask of 7 Oct, and so is the
  matte knife paste: Pasty Flat is the `flat` finish, one colour with no
  light, shadow, texture, tone or dither (the owner's ask, 7 Oct).
- **Pasty's letterings are Goo Teardrop (the default), Goo Even, then
  Drip.** A design saved before `DESIGN_VERSION` 2 still on Drip, the old
  default, takes Goo Teardrop. The tests' `cover` helper names Drip, since
  Pasty's Drip tests were written on it.
- **The controls, and nothing moves** (the owner's ask, 7 Oct): Text,
  Photo, Colour and Size on the left; on the right the cover at a height
  set by the window alone (`.stage`), never by the size or style, then the
  styles in one row under it (a vertical wheel scrolls it), with the chosen
  style's own choices as compact `Dropdown`s beside Shuffle on the row
  above them, so picking a style changes nothing's place. Over the cover:
  undo and redo, Light and Dark, and Reset text once the text is moved. A
  warning is a pill on its label row ("Low contrast"), never a line under
  a control.
- **The photo never leaves the browser.** It is kept in IndexedDB
  (`photo-store.ts`), framed by `photoFrame` and adjusted by `photoAdjust`
  in the design. `photo-gl.ts` and `photo.ts`'s tables are the same
  arithmetic: change both together. On a photo the paste's shadow is its
  own layer, multiplied (`LiquidOp.shadow`).
- **Placed letters are drawn again, never stretched.** `placeScene` wraps
  every foreground op in a `matrix` op and moves each paste bead (radius by
  `strokeScale`), so the paste is made again where it lands; backdrop ops
  (`isBackdrop`: fill, photo, grain) stay put. The thumbnails show every
  style at the same placement. During a gesture the page carries the
  letters as last drawn by the difference of the two matrices (`showLive`,
  the photo shadow as its own multiplied layer) and draws them sharp on
  release. Handle maths lives in `place.ts`, tested: change it with tests.
- **The cover is the text's canvas** (`CoverSurface`): a press on the
  letters selects them; on a photo, only a press on their ink does (a
  press between them moves the photo), and once selected the whole box
  does. The box and its handles are drawn only within the preview's stage,
  never over the controls, and a handle past the cover's edge is pressed
  through a hit spot of its own.
- **A face is loaded only once a cover asks for it**: one font gate per
  face (`fonts.ts`), so the eight plain faces cost nothing until chosen.
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
