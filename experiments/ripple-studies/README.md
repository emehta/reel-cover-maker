# Ripple studies

Open `index.html` in a browser and press **Play once**. The file is self-contained and runs offline. It shows the horizontal and vertical refraction studies side by side.

Both directions open in 210 ms, hold for 560 ms, then return in 180 ms. During the return, the reflections farther from the original letters fade first.

`reference-edge-profiles.json` records the measured RGB gradients from the 600 × 840 Vitrium Opus 2024 reference. Each value is the per-channel median of 19 vertical samples at x = 422–440, aligned at the green channel's midpoint crossing. Negative offsets point inward toward the white face. The preview uses those profiles along the warped letter edges and joins their endpoints to white and black.

The preview is a standalone experiment outside Reelic's application routes and build output. The animation, color lookup, and drawing code live in `index.html`.
