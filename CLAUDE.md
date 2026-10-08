# Reelic

Called Reelic since 7 Oct 2026, the owner's name for it. The repo, the Pages
path and the storage keys keep `reel-cover-maker`, so saved designs and links
carry on.

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
  (`.input, .mirror`). Cmd+B toggles bold; there is no B button (the
  owner asked for none, 7 Oct). Typing carries bold on by `editMarked` and
  never across a space; typed `*word*` pairs become bold by
  `convertStars`.
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
- **Three columns, and nothing moves** (the owner's asks, 7 Oct): on the
  left a card of Text, the lettering row (`.letteringRow`: Stickery's two
  lists, Pasty's one, or the fixed style's typeface, always one row),
  Stickery's Text colour (below), Colour ("Sticker colour" in Stickery;
  its hex chip copies the code) and Size; in the middle the cover on the
  page itself, with no card or border round it (the owner's ask, 7 Oct),
  at a height set by the window alone (`.stage`, grown into what the tools
  and styles leave, up to 560), never by the size or style, and the
  styles in one row under it; on the right a card of the photo
  (`PhotoControls`): a slot of one height, empty or full, and zoom and
  adjustments shown, disabled, before there is a photo, so adding one
  moves nothing. Across the top of the cover's column, the tools
  (`.toolbar`, three `.toolGroup`s, the owner's layout of 7 Oct): undo
  and redo at its left corner; the background (one button, the sun
  turning to the moon), Shuffle and Reset text in its middle; Animate
  and the phone view at its right corner. Icons only, with their names on
  hover (`.tip`); a tool that cannot act is disabled, never removed.
  There is no contrast warning any more (the owner's ask, 7 Oct: "I
  don't want the error message for low contrast"). A chosen segment is
  white in dark mode too, its word dark (the owner's ask, 7 Oct). From
  900 to 1199 pixels the photo goes under the left column and the page
  scrolls with the cover sticky; under 900, one column. **No scrollbar
  shows anywhere** (the owner's ask): every scroller hides its bar, the
  page's too (`globals.css`).
- **The shortcuts are behind a ?** at the top right (`Shortcuts.tsx`, the
  owner's ask, 7 Oct), not at the foot of the left card: a card opened by
  the button or by ? (never while typing), closed by either again, by
  Escape (claimed in the capture phase, so the phone view stays) or by a
  press elsewhere. Hidden on a touch screen. Redo is Cmd+Shift+Z or
  Ctrl+Shift+Z (Ctrl+Y still works).
- **Stickery's text colour** (`TextColourField`, `textColour` in
  palettes.ts, the owner's ask, 7 Oct): Auto (each sticker's black or
  white, `readableOn`, as always), Black, White (`SOFT_BLACK`,
  `SOFT_WHITE`) or a Colour of its own from two sliders. It reaches only
  Stickery (`CoverInput.textColour`, and the scene cache keys it only for
  Stickery, so a pick builds no other style). A press on a resting slider
  and its drag are one undo step (`pickText` names all three fields).
- **Animate** (the owner's asks, 7 Oct). The sparkle opens a card
  (`AnimateCard`) of the cover playing in each of its style's
  animations, with a speed throttle; Save sets `animated`, the style's
  pick (`design.animations`) and `animationSpeed`, and the sparkle
  pressed again stops it. The throttle slides smoothly, to the hundredth
  (the owner, 8 Oct: not fixed steps, and 1 not in the middle): half as
  fast at the left, its own in the middle, twice at the right, on a log
  scale (`speedPlace`, `speedAtPlace`), caught at 1 near the middle.
  Stickery has Type and draw, Slap, Pop and Reveal; Pasty and Pasty Flat
  Written live. All at once, Pasty's Pop and Rise were cut ("so bad"; 8
  Oct: "I don't want rise"), so do not bring them back; Stickery's Pop
  came back on the owner's ask of 8 Oct ("keep pop"). Every
  animation (`animate.ts`, pure, tested) is a function of time on the
  style's own scene, so its last frame is the cover exactly, and a speed
  only scales time (`plan(..., speed)`); an effect is worked out where
  it is seen and carried into each op's frame through its turns and the
  placement (`looked`), paste is moved bead by bead (`pasteAt`), piped by
  length (`chainPart`) with the finished paste's radius pinned
  (`LiquidOp.radius`) and its seed kept. A script word is written as a
  pen would write it (`write` op): its strokes traced once from its ink
  (`write-on.ts`: thinned to its middle line, spurs cut, followed from
  the left straight on through forks, the other way at a fork begun a
  moment after so a bowl fills as the pen passes, each ink pixel taking
  its nearest line point's time straight across the stroke), drawn part
  written by `writer.ts`; with no page to trace in, paint wipes it on.
  In Type and draw the sticker's paper comes with its words (the owner, 8
  Oct: it was "already there"): each sticker shape carries the grid its
  steps were cut on (`grid`), its cells are timed by the letter laid
  nearest each (`paperCells`, `paperTimes`, earlier where two are as
  near) and the cells laid so far traced again as its outline
  (`paperGrowing`, `traceCells`), so it grows a step at a time under the
  typing and ends the sticker exactly. Slap, Pop and Reveal set out the
  frame themselves (`Built.ops`): what is laid in the cover's order, then
  each sticker on its way over it, its words and paste with it, as a thing
  nearer the eye is. Slap comes from in front of the screen (8 Oct: not
  "from the bottom"): first bigger than the cover and blurred, then down
  in perspective (`1 / (1/near + (1 - 1/near) z)`), its shadow on the page
  where it lands closing in, slapped flat, the laid ones knocked back
  about where it lands. Blur is a `blur` op that paint draws with
  shadows, in every engine: the thing drawn far off the canvas and its
  shadow cast back, in its own colour (or a `tint`, for a shadow cast).
  Safari's canvas has no `filter`, and casts a see-through drawing's
  shadow solid, so the alpha goes in the shadow's colour; paste, an image
  of many colours, is softened by drawing it small and back up.
  The preview is painted live at the canvas's own pixels every frame
  (`PlayCanvas`, no stored frames: the owner said it was too low-res);
  only paste is made ahead (`usePaste`, 24 a second, within 200 MB, kept
  in the picture's own pixels so the phone's post draws it too, made once
  for every speed). The video (`video.ts`, `video.worker.ts`) is every
  frame at full size, 30 a second, then the cover held 1.5 s: ProRes 4444
  with alpha in a .mov with no photo (fixed quality `-qscale:v 4`, four
  times as quick as ProRes's own rate control), H.264 MP4 with one. The
  frames are shared out in runs among up to four encoders (two on a
  phone), each run encoded as soon as its last frame is in, joined by
  copy with the held end encoded once and repeated, then retimed
  (`setts=ts=N/(30*TB)`: the join leaves ticks over at each seam, and the
  core's muxer ignores `-video_track_timescale` on retimed packets, which
  played a video twice as fast); MP4s are not joined (H.264 seams drift)
  and pad their held end with `tpad`. ffmpeg's core (jsDelivr, pinned
  0.12.10) is fetched and compiled once a cover is animated
  (`prepareVideo`) and handed to each encoder compiled (`instantiateWasm`).
  Browsers' own encoders keep no alpha, and ffmpeg.wasm's own worker
  cannot be bundled (Turbopack refuses its computed import), so this repo
  has its own worker. Measured 7 Oct: Stickery 3 to 9 s, Pasty 6 to 14 s.
  A press on Download in its first 800 ms is a double click, not a stop.
- **Download is at the foot of the photo's card** (the owner's ask, 7 Oct:
  "below dim"), sticky there, the card drawn closer on windows under 900
  tall so Dim and Download both show (`@media (max-height: 900px)`); from
  900 to 1199 wide it is held at the foot of the left column, and on a
  phone at the foot of the screen. It reads Download everywhere (the
  owner, 8 Oct: not "Export"), with a tag of what it makes (PNG, MOV or
  MP4), and Preparing and how far while a video is made.
- **The phone view's posts are the owner's** (the owner's ask, 7 Oct):
  @eshaan.tm's four reels, newest first, after the cover as they would
  follow a new post, and its profile picture in the tab bar
  (`posts/`, downscaled from the covers Instagram served that day; the
  thumbnail links were read from Vitae's `instagram_media`, never with a
  secret key). A reel posted since is not there until `posts/` is
  refreshed. The header's mark is `src/app/icon.svg` itself, so it is
  the favicon.
- **Three heights** (the owner's ask, 7 Oct): `--rcm-h-field` (44: a text
  field, a list, a segmented control), `--rcm-h-button` (36: every button,
  the toolbar's, the photo's) and `--rcm-h-mini` (28: a button
  on a label's row). A label row is exactly a mini button tall, with no
  negative margin: one with a margin let the photo's buttons be cut off by
  their card's top.
- **Small corners** (the owner's ask, 7 Oct: "too rounded"): a card 8
  pixels (`--rcm-r-card`), a field 6, a button 5, a small button 4, a
  thumbnail 3. Only a dot, a slider's knob and the camera's shutter are
  round; the phone view's phone keeps a phone's own corners.
- **The phone view is a whole iPhone to scale** (`PhoneView`, `phone.ts`,
  the owner's asks, 7 Oct: the whole phone in sight, "absolutely
  accurate", the cover in the centre): a 393 by 852 point screen, status
  bar 54, safe area 59 and 34, Instagram's name bar and tabs (44 each) and
  tab bar (49), the grid between them scrolled so the cover's post is the
  middle column of the middle row, its centre the grid's (`coverTile`).
  `--u` is a point, as large as the preview fits the whole phone and never
  above a CSS pixel. Every number comes from `phone.ts` as a custom
  property, and the tests hold them. The profile is the owner's own,
  @eshaan.tm (`HANDLE`), public, so with no lock by its name. The tile is drawn from the scene like
  every canvas (`SceneCanvas`, `gridWindow`), on the ground picked. The
  cover to edit stays mounted and painted underneath (hidden), so Download
  never waits on it. Never say it is a phone's real size: on a laptop it
  is smaller.
- **With no photo the cover is clear** (the owner's ask, 7 Oct): no fill,
  no grain; the PNG is the letters alone. The ground picked still colours,
  outlines and lights them (`LiquidOp.under`), and the page shows the
  cover on a check of its tone (`data-clear`), never in the file. Every
  paint of the preview clears the canvas first. Pasty's shadow over
  nothing is a stain (`stain` in liquid-render.ts, `uShadow` with
  `uHasUnder` in the shader), not a multiply: laid on the ground picked it
  is the old drawn shadow to within 3 levels in 255 (tested, and measured
  against the previous build's PNGs).
- **The style thumbnails are the whole cover**, in its own shape, six to a
  row as wide as fits (three by two under 900): never the profile grid's
  crop, which cut a reel cover's sides off (the owner's ask, 7 Oct), and
  never a row that scrolls. Grid crop shows the grid's window on the
  cover itself.
- **A style picked shows at once.** Once the picture is drawn the page
  asks for the cover in every style at full size (`ahead` in
  `liquid-client.ts`), on one of two workers, so the other is free for the
  screen; until a full-size field is made the preview shows a draft made
  at half size (`DRAFT_SCALE`), drawn up. Every style's scene is built by
  `coverFor`, so what is made ahead is the scene picking it shows. The
  edge reads the depth's slope capped at 1: past it is where the depth was
  not worked out, and on a small canvas it drew a line.
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
