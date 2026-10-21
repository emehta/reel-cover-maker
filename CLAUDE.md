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
  `layout`, `liquid-layout`, `liquid`, `liquid-render`, `stepped`, `ink`, `renaissance`, `noise`,
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
- **Inkblot is a typeface printed, not set** (the owner's ask, 19 Oct:
  Editorial out, Onehart's inkblot script in its place, "the roughness
  around the edges", "everything tiny about the fonts"). Pinyon Script is
  the face (the closest open one to Onehart's roundhand, capitals and all);
  the page traces each word's outline from its ink (`Measurer.outline`,
  fonts.ts), and `ink.ts` prints it: a signed distance field about a pixel
  of the cover apart, bled by `PRINT.bleed`, its weight wandering along
  the word, the edge moved by noise (a wander, chipped notches, grit) and
  bitten now and then, traced again where the field is nought. The numbers
  were matched against Onehart's specimen; a heavier bleed closes Pinyon's
  narrow h and l loops. A word is seeded by its text and the shuffle and
  printed once (`printedWord`), so it prints the same wherever it goes.
  Lines are broken at `INK_SET`, each centred by its ink, let down only as
  far as keeps `INK_LINE_GAP` between one line's printed ink and the
  next's, then the block grows by its ink up to `INK_MAX`. An emoji is
  text. Saved Editorial designs open on Inkblot (`readDesign`).
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
- **Bold is Stickery's and Renaissance's alone.** Bold is kept as stars in
  `design.text` (`readMarked`/`writeMarked` in title.ts, a typed star or
  backslash escaped): Stickery's funky words, Renaissance's script;
  `buildScene` reads every other style's title with its bold as plain
  words (the owner's ask, 7 Oct): no accent colour, italic or highlight
  anywhere else.
- **Renaissance is a lockup** (the owner's ask, 20 Oct, after three
  posters: THE ART *of* SUMMERTIME, FIND *Your* NICHE, TRAVEL *The*
  WORLD; `renaissance.ts`, pure). Its **Look** is one poster, capitals
  and script matched (the owner, 20 Oct: never two free lists, after a
  thin script on heavy capitals looked wrong), the owner's picks from
  previews against the posters: Summertime (Playfair Display SC, squeezed
  to 0.59, Luxurious Script), Niche (Anton at 1.05, Pinyon Script, black)
  and Travel (Big Shoulders 900 at 0.8, Luxurious Script). Scripts were
  chosen from all 357 Google Fonts handwriting families set as of, Your
  and The beside the posters; the owner rejected Great Vibes' f (no top
  hook, a folded bottom loop) and its The outright. Capitals are drawn
  squeezed (`sx`, measured so the poster's word is its width); a script
  has a broad pen's weight (`nib`: copies across, a canvas pixel apart,
  so downstrokes thicken and hairlines do not; uniform stroking flattened
  the contrast). Lines a tenth of a cap height apart; a join opens only
  as far as keeps the script's reach into each line to 0.86 cap heights
  for a narrow one (the of), 0.22 for a wide one (the The). The script's
  small letters 0.56 of a cap height, raised for a short word (to, in) to
  cover 0.28 of its lines (the owner: "to" was too small, after it had
  been too big), at most 1.5 cap heights tall, at most 0.9 of the lines'
  width. In the capitals' colour it carries `knock` (a thin gap); in
  another, `knockShape` too (`silhouetteLoops`: its ink, loops and the
  gaps its swashes sweep closed, a margin round it), as the second
  poster's black Your takes its whole shape out of the red. The lockup is
  a `knockout` op, drawn as a layer of its own so nothing is cut from the
  photo. With no word bold the linking word nearest the middle is the
  script (`scriptWords`); at either end of the title a script tucks
  lightly (the owner's pick).
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
  seals instead), runs of the same fields within 800 ms are one step (a
  slider dragged, a word typed), a press of a button or a choice made is
  always a step of its own (`update(change, "alone")`: three shuffles in a
  second are three undos), and Cmd+Z in the Text field is this undo too
  (the browser's own would bring back text without its bold).
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
  its hex code is pressed to type one, with a copy button of its own
  beside it, the owner's ask of 20 Oct: `HexField`) and Size; in the middle the cover on the
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
  hover (`.tip`), above them, never below where they fell on the cover
  (`.tipEnd` runs inward at a row's end, `.tipLeft` opens to the left
  where there is no room above, the header's ?); every button's name is
  one of these, never a native `title`. A tool that cannot act is
  disabled, never removed (Shuffle in Echo and Mono, `shuffles`). Hover
  fills are only for a pointer that hovers (`@media (hover: hover)`), so a
  tap never leaves one lit.
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
- **A typed hex code is the colour exactly** (`design.hex`,
  `design.textHex`, `ColourChoice.hex`): the sliders go to the nearest
  they can name (`slidersFor`), which sets what is worked out from the
  colour (an accent, the second sticker), and a slider moved sets the code
  back to null. Each keystroke that makes a colour is applied, as one undo
  step with the rest; Escape puts back the colour from before.
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
  Renaissance has Written (capitals rise in line by line, then the script
  is penned across them, its gap cut round what the pen has written:
  `cutAround`), Word by word and Line by line; Stickery has Type and draw, Slap, Pop and Reveal; Pasty and Pasty Flat
  Written live; Inkblot Written (each printed word traced as a pen writes
  it, word after word), Word by word and Line by line (into focus out of
  nothing, as ink soaks in). All at once, Pasty's Pop and Rise were cut ("so bad"; 8
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
  "below dim"), sticky there, the card drawn closer on windows under 860
  tall so Dim and Download both show (measured: the roomier card fits
  from 860), and closer again under 780; from
  900 to 1199 wide it is held at the foot of the left column, and on a
  phone at the foot of the screen. It reads Download everywhere (the
  owner, 8 Oct: not "Export"), with a tag of what it makes (PNG, MOV or
  MP4), and Preparing and how far while a video is made. It is never
  disabled and never changes colour (the owner, 21 Oct: it faded in and
  out at every change while the paste was drawn): pressed before the
  picture is on the canvas, it saves once it is (`waitingSave`); with no
  title typed, it puts the caret in the Text field.
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
- **The style thumbnails are the whole cover**, in its own shape, seven to
  a row as wide as fits (four over three, centred, under 900; the owner's
  order of 20 Oct: Stickery, Renaissance, Inkblot, Pasty, Pasty Flat,
  Echo, Mono): never the profile grid's
  crop, which cut a reel cover's sides off (the owner's ask, 7 Oct), and
  never a row that scrolls, the row as tall for every size so the cover
  never moves for it. The six other styles are made from the design once
  it has paused for `SETTLE_MS` (`settled`): made at every keystroke, they
  cost each key about a tenth of a second. Grid crop shows the grid's
  window on the cover itself.
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
- **A side handle is a text box's** (the owner's ask, 21 Oct, and again
  the same day: "it doesn't work like Adobe Illustrator at all"): with no
  key it re-wraps (`wrapTo`: left and right to a width, top and bottom to
  a height, the opposite side kept), as far as it is pulled, past the
  cover's edge too, and never narrower than a word a line; the letters
  never change size, at any width or however much is typed into it, and
  its words are always inside the frame, so the frame is where the
  pointer is (tested for every style). With Shift a side scales keeping
  the shape (`dragHandle` `keep`), with Cmd or Ctrl it stretches one way;
  a corner scales keeping its shape and with Shift freely; Alt works from
  the middle; a key pressed mid-drag applies at once; a Ctrl press on a
  handle opens no menu. `Place.wrap` is the width; each style sets its
  words again for it at the size its own layout settled on
  (`Scene.wrapRef`, `CoverInput.wrap`, `Scene.wrapped`), and at its own
  width exactly as it set them, so a drag never jumps on its first pixel:
  - a style that measures lines by advance and its box by ink carries the
    difference (`slack`: Inkblot, Renaissance, Pasty);
  - a flow style's wrapped block is held where its own box held it
    (`settle`), and Inkblot cuts its lines into slices counted from their
    centre, so the same words at another size space the same way; its
    narrowest is printed, once (`inkblotNarrowest`);
  - Stickery wraps every line, funky words and plain, to a measure that
    moves one for one with the box edge from its own widest line (`delta`
    in `build`), each plain line the size the style set the line in its
    place, the funky words broken where the style broke them;
  - Pasty keeps its own breaks (`counts`): a break there only because the
    words did not fit goes as soon as they do, a line it set apart though
    it fitted is let go one by one (`own` in the liquid wrap); its paste is
    kerned past its advance, so it is wrapped again by its real width until
    it is inside the box (`within`, which Stickery's paper and zigzag use
    too), and its narrowest is the narrower of a word a line and its own
    breaks; it holds its height-scaled cap (`most`), the drips' reach
    (`tail`) and where it broke a word too long (`breakAt`);
  - Renaissance holds its scripts' sizes, scaled when typing changes the
    size its own layout would choose.
  `Place.wrapSize` keeps the size for the style and type it was made in
  (`wrapTypeOf`, `textBoxRef`), and Stickery's plain lines' sizes
  (`fits`), so typing more never resizes a word; another style picked
  for the box keys it again to that style at once (`update`), and typing
  grows the box down from its top (`keepTop`). A handle moves by as far
  as the pointer does from where it was pressed (`offset`), never to the
  pointer, so a press off a handle's centre never jumps. The top and
  bottom take whichever of the lines there are and the two tried comes
  nearest the height asked, the lines there are on a tie, and hug the
  words they pick (`hug`, `Scene.wrapped.content`). A re-wrap is shown
  by setting the scene again at each move (`reflow` in the page), not by
  carrying the last picture, the next move waiting for the last one's
  paste (`waitingReflow`), so a paste style updates as fast as it is
  drawn rather than not at all until the pointer rests.
- **The cover is the text's canvas** (`CoverSurface`): a press on the
  letters selects them (on a phone, a swipe up or down over the cover
  scrolls the page until the letters are selected or a photo is there to
  move: `touch-action: pan-y`, and a press the browser takes back for it
  lets go of what it selected); on a photo, only a press on their ink does (a
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
