// The Reelic cover's renderer, for the projects card on eshaanm.net. On this branch, start the stage
// with `npx next dev --webpack -p 3911`, then: node scripts/cover-render.mjs master <out.mkv>, and
// scripts/cover-encode.sh <out.mkv> <dir>. Needs playwright-core (not a dependency of the maker) and ffmpeg.
//
// node render.mjs stills <outDir> <t,t,...>     PNG stills at 1600x2000
// node render.mjs master <out.mkv> [from] [to]  every frame, Lanczos to 800x1000, lossless FFV1
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [mode, out, a, b] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--force-color-profile=srgb"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 2000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:3911/cover?v=${Date.now()}`, { waitUntil: "networkidle", timeout: 120000 });
const t0 = Date.now();
try {
  await page.waitForFunction(() => window.STAGE && window.STAGE.duration > 0, null, { timeout: 300000 });
} catch (e) {
  console.log(logs.join("\n"));
  throw e;
}
const info = await page.evaluate(() => ({ duration: window.STAGE.duration, beats: window.STAGE.beats }));
console.log(`ready in ${Date.now() - t0} ms, duration ${info.duration}`);
console.log(JSON.stringify(info.beats));
const canvas = page.locator("#stage");
if (mode === "stills") {
  for (const t of a.split(",").map(Number)) {
    const s = Date.now();
    await page.evaluate((t) => window.STAGE.seek(t), t);
    writeFileSync(`${out}/t${t.toFixed(2)}.png`, await canvas.screenshot({ type: "png" }));
    console.log(`t=${t} ${Date.now() - s} ms`);
  }
} else {
  const fps = 60;
  const total = Math.round(info.duration * fps);
  const from = Number(a ?? 0), to = Number(b ?? total);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", "60", "-c:v", "png", "-i", "-", "-vf", "scale=800:1000:flags=area+accurate_rnd+full_chroma_int", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgr0", out], { stdio: ["pipe", "inherit", "inherit"] });
  const start = Date.now();
  for (let f = from; f < to; f += 1) {
    await page.evaluate((t) => window.STAGE.seek(t), f / fps);
    const buf = await canvas.screenshot({ type: "png" });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) console.log(`frame ${f}/${to} ${((Date.now() - start) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`frames ${from}..${to} in ${((Date.now() - start) / 1000).toFixed(0)} s`);
}
const bad = logs.filter((l) => !l.includes("preloaded using link preload")); if (bad.length) console.log(bad.slice(0, 20).join("\n"));
await browser.close();
