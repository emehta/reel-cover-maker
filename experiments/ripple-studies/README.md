# Ripple studies

Open `index.html` in a browser and press **Play once** (Shift-click plays at quarter speed). It needs WebGL 2 and the network for the Inter Tight face, and falls back to Arial Black offline. Two studies of the word seen through fluted glass:

- **Horizontal:** vertical flutes. The middle letters keep still. The R and the e step out through the glass, and past each end six echoes slide off the letter's edge, warmest and thinnest furthest out.
- **Vertical:** horizontal slats, after the 2024 Vitrium Opus poster. Each slat shows the word moved and leaning by its own step, so the word stacks above and below, with a dark line and a warm glint where slats meet.

Both open on a spring (about 130 ms to full, a 14% overshoot that settles), hold to 800 ms, then draw back in on a stiffer spring, the outer echoes going first.

## How the light is made

Everything is one fragment shader, 60 fps in Chromium and WebKit on an M1.

- **Letters** are an exact signed distance field (Felzenszwalb and Huttenlocher, from a mask drawn at twice the canvas size), so they stay sharp however the glass magnifies them. Seams between flutes are anti-aliased by blending the two flutes a pixel straddles.
- **Colour** is real dispersion, not a colour ramp. Each pixel samples the letters at 32 wavelengths, each bent by its own amount (mostly linear in wavelength, a tenth Cauchy). The samples are weighted by the CIE 1931 observer in linear sRGB, signed, so the whole spectrum sums to white. The light is then overexposed 1.8x and soft-clipped (linear to 0.6, an exponential shoulder above). Fitted against the poster's measured fringes (`reference-edge-profiles.json` plus fresh samples), this lands within about 0.03 OKLab RMS. It gives white, yellow, orange, red, dark on one side; white, cyan, blue, violet, dark on the other; and the full sweep through magenta where a thin dark gap sits between them.
- **Softness** grows with the fringe's width in the poster's proportion, but only across edges that face along the bend, so the other edges stay crisp.

## Open-state options

`open-options.html` reworks the held, rippled state in four options (press A to D). The word stays whole and sharp. Behind it are four copies, each a little larger about the middle, so copies come out of every letter: widest at the ends, easing to nothing at the centre. Copies stack like opaque layers, so only each one's rim shows, parted from the next by a soft dark gap. Their light splits in alternating directions, so the rims alternate warm and cool.

- A and B: brightest by the word, fading outward. C and D: brightest at the tips.
- A and C: each flute carries its copy one even step, with the steps ramping into each other. B and D: whole copies, each bowed outward like a ripple ring.

## Fluted glass, after the reference video (the Original)

`original.html` is this version, kept as it was on 9 Nov when the owner named it the **Original**: the one to go back to.

`fluted.html` follows the "S letters animate distort" Cavalry video (Pinterest pin 743797694746841478) and a fluted-text frame. It shows the open state only, with no Play. Each point shows one view through one flute; nothing is stacked. Dense, even flutes cover the word and magnify the strip behind them. The letters' tops and bottoms stay flat, fringed warm and blue. Past the letters, each flute looks a step further off their end and squeezes it into a hairline, blue on its outer side, each one fainter, down to nothing. In the vertical study, each column's echoes start from that column's own top and bottom, so every letter ripples both up and down.

## Explorations from the Original

`explorations.html` shows the Original beside three ways to show its rippled-out part (press O, A, B or C). Colours and the glass over the letters stay as in the Original.

- **A Taper:** the echoes start as fat slices of the letter beside them and thin steadily into hairlines, further out.
- **B Contour:** each echo looks deeper into its letter at the letter's middle, so it comes out a crescent: "(((" off the R, ")))" off the e, arcs over every letter in the vertical study.
- **C Lens:** in the horizontal, further echoes are shorter, so they narrow into a cone off each end. In the vertical, echoes reach furthest over the word's middle, closing into an oval.


## Contour, after B

`contour.html` takes **B Contour** (the owner's pick from the explorations) further: crescents that contour more, the one beside each letter widest and each further one a step narrower, so they trail outward. Press B, D, E or F for a version; **Open** holds it open, **Play** (or the space bar) runs the motion once.

- **B Contour:** as picked, unchanged to the pixel.
- **D Deep:** each crescent fills most of its flute at its letter's middle and comes to a point at the letter's ends; each is about a seventh narrower than the one before.
- **E Trail:** the same with a steeper step, and each crescent a little shorter than the last, so the echoes trail away to a point.
- **F Swell:** fuller, rounder crescents, fewer of them, narrowing and shortening fastest.

In D, E and F each crescent is drawn to measure. The shader decides how much of its flute the echo fills at this height, then aims the flute so the letter's edge lands exactly there. The glass stretches each letter by up to half a flute, evenly from the word's middle, so it ends exactly on a flute line; its first, widest crescent sits one fine dark seam away, so every flat top, bottom and side stays flat and no corner is lost. The crescents stay where the fully open glass puts them: as the glass opens, the letter slides out to meet them. In the vertical study the echoes see each letter's outline smoothed (the notch in a heavy p and the gap under the R bridged), split where it steps (a p's descender gets its own arcs), and every column of a letter part starts its echoes on the same flute, so the arcs come out whole. The letters themselves are untouched, and the columns between letters show the glass as it is.

The motion is copied from the reference video, measured on all 241 frames at 60 fps (the owner's screen recording plays the same 4 s loop three and a half times). In the video the flutes never move: each echo widens and narrows where it is, the outer ones lighting later and going dark first. Two things are measured on every frame: how far the glass over the letter displaces its edges, and how much echo shows past the letter. They become the GLASS and REACH curves in the page. The glass starts first and lets go last; both swell to full by 1.35 s and fall; the glass lets go entirely for three frames, comes back in steps, and both make a second, smaller swell that holds and is drawn in by 3.4 s, the steps settling by 4 s. Each echo grows out of nothing over the same stretch of reach and is born white; its colour follows the glass a tenth of a second behind. Left out on purpose: the reference's glow and defocus (it would read as haze), its one-frame cyan flashes, and the flip of its crescents in the second take.

## Trail, after B

`trail.html` is **B Contour** again, after the owner said its horizontal trail went "just a lil too far on either side" and should fade out a bit faster. Press B, G, H or I for a version; **Open** holds it open, **Play** (or the space bar) runs the motion once.

- **B Contour:** as picked, unchanged to the pixel.
- **G Trim:** the trail fades to nothing 10 flutes out instead of 12.
- **H Close:** 9 flutes.
- **I Tight:** 8 flutes.

Only the brightness of the horizontal echoes changes (`fadeTo`, the flutes over which they fade to nothing). Every echo keeps B's width, crescent shape, place and colour, so the ones nearest the letters look as they did and the trail simply ends sooner. The vertical study is B's in all four. The page shows the horizontal study across its full width, each study cropped to the band of the stage it uses.

`codex-2026-11-08.html` is the previous version, kept for comparison.
