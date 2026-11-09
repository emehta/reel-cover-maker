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

`codex-2026-11-08.html` is the previous version, kept for comparison.
