/**
 * Ripple's glass, on the GPU, drawn where paint.ts meets a glass op.
 *
 * The word is drawn twice over its own size, alone, and its letters made an
 * exact distance field (`glassField`, glass.ts); then a fragment shader (the
 * ripple studies' own, as the owner picked them) reads them through each
 * flute at 32 wavelengths and lights the result for the cover's ground and
 * the word's colour, see-through where nothing is, so the file stays clear
 * but for the letters and their light. A field is kept for each word at each
 * size it is drawn at, so a frame of the motion is only the shader.
 *
 * The layer is drawn at the canvas's own pixels where the letters are not
 * turned, so its edges are as sharp as text; turned, it is drawn in the
 * letters' frame and turned with them. One WebGL 2 context draws every
 * layer, each copied out at once. Without WebGL 2 (or with the context
 * lost), nothing is drawn here and paint sets the word as plain text.
 */

import type { FaceId } from "@/components/reel-cover-maker/faces";
import {
  EXPOSURE,
  FLUTES,
  glassField,
  OPEN,
  REFERENCE_INK,
  REFERENCE_WORD_PX,
  spectrum,
  TONE_NORM,
  WAVES,
  type GlassField,
  type GlassOp,
} from "@/components/reel-cover-maker/glass";
import { rgb } from "@/components/reel-cover-maker/palettes";

const VERTEX = `#version 300 es
in vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes, uCentre;
uniform float uAxis, uHalf, uPitch, uCore, uEdge, uFan, uFanPow, uLocal, uSides;
uniform float uSqueeze, uSqueezeTip, uSqueezeEcho, uCurve, uBendFloor;
uniform float uEchoes, uFadeTo, uEchoAnchor, uEchoStep, uEchoFade, uEchoSoft, uBow, uBowOut, uReachNow;
uniform float uFace, uKappaOut, uKappaFan, uKappaB, uDisp, uFlash, uS, uV;
uniform float uFmax, uSoftSplit, uSoftMax, uSigma0, uSigma1, uExposure, uToneNorm;
uniform vec2 uSpanL, uSpanR;
uniform vec3 uInk, uGround, uGroundSrgb;
uniform float uLight, uContrast, uLift;
uniform sampler2D uExtent;
uniform vec4 uW[${WAVES}];
uniform sampler2D uSdf;
uniform vec4 uSdfRect;
// The field is made for the word at a size a hair off this one, from a whole pixel: where its ink's middle is in
// what it was made in, how much larger the word is drawn than it was made, and how wide its columns' ink runs.
uniform vec2 uCentreP;
uniform float uScale, uResP;
// How strongly the glass bends the letters themselves, of the studies' (the echoes as they were).
uniform float uLetterBend;
out vec4 outColor;

float field(float a, float b) {
  vec2 p = uCentreP + (uAxis < 0.5 ? vec2(a, b) : vec2(b, a)) / uScale;
  return texture(uSdf, (p - uSdfRect.xy) * uSdfRect.zw).r * uScale;
}
float cover(float d, float s) { return 1.0 / (1.0 + exp(1.702 * d / s)); }

// One flute: where it looks into the ink, wavelength by wavelength.
vec3 flute(float k, float u, float a, float b) {
  float s = uS;
  float c = k * uPitch;
  float ac = abs(c);
  float r = ac / uHalf;
  float sig = mix(uSigma0, uSigma1, clamp(abs(s), 0.0, 1.0));
  if (abs(s) < 1e-4) return vec3(cover(field(a, b), uSigma0));
  // Where the letters end on this flute's side: each column's own top or
  // bottom (Vertical), so every letter throws echoes both up and down; or
  // the word's two ends (Horizontal).
  float endAt = uEdge * uHalf;
  vec4 ext = vec4(0.0);
  if (uLocal > 0.5) {
    ext = texture(uExtent, vec2((uCentreP.x + b / uScale) / uResP, 0.5)) * uScale;
    endAt = c < 0.0 ? ext.r : ext.g;
  }
  // The letter an echo comes off: its middle and half extent across the bend.
  vec2 span = uLocal > 0.5 ? ext.ba : (c < 0.0 ? uSpanL : uSpanR);
  float outer = max(0.0, ac - endAt);
  // A column with no ink, beside or between letters, throws no echoes: it
  // shows the glass as it is, so the letters' sides keep their soft edge
  // and fringe all through the motion. (A column with no ink has no letter
  // half width; one with ink has at least half a pixel.)
  float between = uSides > 0.5 && uLocal > 0.5 && span.y < 0.25 ? 1.0 : 0.0;
  float echo = step(0.5 * uPitch, outer) * (1.0 - between);
  float far = clamp(outer / max(0.001, (uEchoes + 0.5) * uPitch), 0.0, 1.0);
  // Over the letters each flute shows the word moved out a little, more
  // toward the ends.
  float fan = -s * sign(c) * uFan * uHalf * pow(min(r / uEdge, 1.0), uFanPow) * (1.0 - echo) * (1.0 - between);
  // Past the letters each flute looks a small step further off their end,
  // and the echoes reach as far as the glass is strong.
  float run = outer / max(uReachNow, 0.001);
  float view = uEchoAnchor * endAt + uEchoStep * (run - 0.5 * uPitch);
  // Contour: each echo looks deeper into its letter at the letter's middle
  // than at its ends, so it comes out a crescent, thick and then pointed.
  float t = clamp((b - span.x) / max(span.y, 1.0), -1.0, 1.0);
  view += uPitch * (uBowOut - uBow * (1.0 - t * t)) * sqrt(far);
  float bend = s * mix(uBendFloor, 1.0, smoothstep(uCore, uEdge, r));
  // Over the letters a flute magnifies the strip behind it; past them it is
  // looked through more steeply, so it squeezes the letter down to a hairline.
  float sq = echo < 0.5
    ? mix(uSqueeze, uSqueezeTip, smoothstep(0.0, uEdge, min(r, uEdge)))
    : mix(uSqueezeTip, uSqueezeEcho, smoothstep(0.0, 0.8, far));
  float h = u * (1.0 - bend * sq) + bend * uCurve * (4.0 * u * u * u - u);
  float dh = (1.0 - bend * sq) + bend * uCurve * (12.0 * u * u - 1.0);
  // Over the letters, their own bend through each flute gentler than the studies': at a cover's size on a screen, a curve broken at
  // every flute line by the studies' bend read as stair steps (the owner: "pixelated"). The echoes keep theirs.
  float own = mix(uLetterBend, 1.0, echo);
  h = u + (h - u) * own;
  dh = 1.0 + (dh - 1.0) * own;
  float outPart = echo * sign(c) * (view - ac);
  float D = outPart + fan + (h - u) * uPitch;
  // The light splits a moment after the glass comes and stops a moment
  // before it goes, so echoes are born white (uDisp; 1 held open).
  float split = (uKappaOut * outPart + uKappaFan * fan + bend * uFace * 2.0 * u * uPitch) * uDisp;
  split *= 1.0 + uFlash * abs(uV);
  split = split / (1.0 + abs(split) / uFmax);
  sig += s * far * uEchoSoft;
  // A wide fringe is a soft one, in the poster's proportion, but only
  // across edges that face along the bend, where the light is split most.
  float soft = min(sqrt(uSoftSplit) * abs(split), uSoftMax);
  // Each further echo a little fainter than the last, down to nothing
  // uFadeTo flutes out.
  float gone = clamp(outer / max(0.001, (uFadeTo + 0.5) * uPitch), 0.0, 1.0);
  float fade = pow(1.0 - gone, 1.0 + 1.4 * uEchoFade);
  float bright = mix(1.0, fade * clamp(s, 0.0, 1.0), echo);
  // The glass splits the light a little across too, about the middle, so
  // the letters' flat tops and bottoms are fringed without being reshaped.
  float splitB = uKappaB * bend * b * uDisp;
  float mid = field(a + D, b);
  float along = clamp(0.5 * abs(field(a + D + 1.0, b) - field(a + D - 1.0, b)), 0.0, 1.0);
  // (The magnified softness grows in with the glass.)
  float se = sqrt(sig * sig + along * along * (0.16 * dh * dh * smoothstep(0.0, 0.08, abs(s)) + soft * soft));
  vec3 acc = vec3(mid < 0.0 ? bright : 0.0);
  if (abs(mid) <= (abs(split) + abs(splitB)) * 0.6 + 4.5 * se + 2.0) {
    acc = vec3(0.0);
    for (int w = 0; w < ${WAVES}; w++) {
      acc += cover(field(a + D + split * uW[w].w, b + splitB * uW[w].w), se) * uW[w].rgb;
    }
    acc *= bright;
  }
  // While the glass is barely there it eases in over the resting letters,
  // so the motion does not jump as the glass comes on or lets go.
  float ease = smoothstep(0.0, 0.05, abs(s));
  if (ease < 1.0) acc = mix(vec3(cover(field(a, b), uSigma0)), acc, ease);
  return acc;
}

vec3 tone(vec3 x) {
  vec3 hi = 0.6 + 0.4 * (1.0 - exp(-(x - 0.6) / 0.4));
  return mix(x, hi, step(0.6, x));
}
vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 q = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) - uCentre;
  float a = uAxis < 0.5 ? q.x : q.y;
  float b = uAxis < 0.5 ? q.y : q.x;
  float f = a / uPitch;
  float k = floor(f + 0.5);
  float u = f - k;
  vec3 col = flute(k, u, a, b);
  // Within a pixel of a flute line, the two flutes' views meet.
  float edge = (0.5 - abs(u)) * uPitch;
  float side = u >= 0.0 ? 1.0 : -1.0;
  if (edge < 0.5) col = mix(col, flute(k + side, f - k - side, a, b), 0.5 - edge);
  // The light that reaches the eye, as white letters on black would give it:
  // how much of the letters each pixel sees (its brightness) in the word's
  // own colour over the ground, and the light's colours split from it laid
  // on top as they are, so the fringes keep the poster's colours whatever
  // the word's; a word darker than its ground splits them the other way
  // round (the colours a dark letter shows through glass).
  vec3 lit = clamp(tone(max(col, 0.0) * uExposure) / uToneNorm, 0.0, 1.0);
  float seeing = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  // A word nearer its ground than white is (a deep red on near-black) has its half-seen crescents lifted, so they show as white's do,
  // and its split light kept outside its letters, so no rim of it inside one reads as an outline (a review). White's are as they are.
  float lifted = mix(seeing, pow(max(seeing, 1e-6), uLift), step(1e-4, 1.0 - uLift));
  vec3 split3 = (lit - seeing) * uLight * mix(1.0 - seeing, 1.0, uContrast);
  vec3 seen = encode(mix(uGround, uInk, lifted) + split3);
  // As see-through as lets it lie on the ground exactly: clear where it is
  // the ground, solid only as far as it is further from it than the ground
  // can be from black or white.
  vec3 g = uGroundSrgb;
  vec3 up = max(seen - g, 0.0) / max(1.0 - g, vec3(1e-4));
  vec3 down = max(g - seen, 0.0) / max(g, vec3(1e-4));
  float alpha = clamp(max(max(max(up.r, up.g), up.b), max(max(down.r, down.g), down.b)), 0.0, 1.0);
  outColor = vec4(clamp(seen - g * (1.0 - alpha), 0.0, 1.0), alpha);
}`;

interface Gpu {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  sdf: WebGLTexture;
  extent: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
  /** The field last handed to the textures, so a frame of the motion hands it over only once. */
  loaded: PreparedWord | null;
}

let gpu: Gpu | null | undefined;

const NAMES = [
  "uRes", "uCentre", "uAxis", "uHalf", "uPitch", "uCore", "uEdge", "uFan", "uFanPow", "uLocal", "uSides",
  "uSqueeze", "uSqueezeTip", "uSqueezeEcho", "uCurve", "uBendFloor",
  "uEchoes", "uFadeTo", "uEchoAnchor", "uEchoStep", "uEchoFade", "uEchoSoft", "uBow", "uBowOut", "uReachNow",
  "uFace", "uKappaOut", "uKappaFan", "uKappaB", "uDisp", "uFlash", "uS", "uV",
  "uFmax", "uSoftSplit", "uSoftMax", "uSigma0", "uSigma1", "uExposure", "uToneNorm",
  "uSpanL", "uSpanR", "uInk", "uGround", "uGroundSrgb", "uLight", "uContrast", "uLift", "uExtent", "uW", "uSdf", "uSdfRect", "uCentreP", "uScale", "uResP", "uLetterBend",
];

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function texture(gl: WebGL2RenderingContext, filter: number): WebGLTexture | null {
  const t = gl.createTexture();
  if (!t) return null;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function setUp(): Gpu | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true });
    if (!gl) return null;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, "aCorner");
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // The distance field read between its pixels; each column's ink read at its own column, exactly.
    gl.activeTexture(gl.TEXTURE0);
    const sdf = texture(gl, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE1);
    const extent = texture(gl, gl.NEAREST);
    if (!sdf || !extent) return null;
    const uniforms = Object.fromEntries(NAMES.map((n) => [n, gl.getUniformLocation(program, n)]));
    gl.uniform1i(uniforms.uSdf, 0);
    gl.uniform1i(uniforms.uExtent, 1);
    gl.uniform4fv(uniforms.uW, spectrum(WAVES));
    // A context taken away (Safari does, in a tab left in the background) is made again the next time the glass is drawn.
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      gpu = undefined;
    });
    return { canvas, gl, sdf, extent, uniforms, loaded: null };
  } catch {
    return null;
  }
}

const linear = (hex: string) =>
  rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

/** A word made ready at one size: its field, and where it lies in the layer it is drawn in, all in that layer's pixels. */
interface PreparedWord {
  /** The size it was made at, canvas pixels to the em. */
  size: number;
  field: GlassField;
  /** The layer: its size, and where in it the text is set from (its start on the baseline). */
  w: number;
  h: number;
  tx: number;
  ty: number;
  /** The field's place and size in the layer. */
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  /** The ink's middle in the layer, and its half width and height. */
  cx: number;
  cy: number;
  half: { x: number; y: number };
  /** Each of the layer's columns' ink, for Vertical (four a column). */
  extent: Float32Array;
}

/** Moves whenever a font arrives. */
let fontsArrived = 0;
let watching = false;

function watchFonts() {
  if (watching || typeof document === "undefined" || !document.fonts) return;
  watching = true;
  document.fonts.addEventListener("loadingdone", () => {
    fontsArrived += 1;
  });
}

/** The largest a word's field is made at, canvas pixels to the em: larger is enlarged from it. */
const LARGEST = 640;

/** Words made ready, the most recent last. A frame of the motion draws the same word at the same size again and again. */
const prepared = new Map<string, PreparedWord>();
const KEEP = 12;

let maskCanvas: HTMLCanvasElement | null = null;
let probe: CanvasRenderingContext2D | null = null;

/** How many times over a word is drawn before its field is made: the field is the mean of each pixel's samples. */
const OVER = 2;

/** The word drawn alone, `OVER` times over, from (`ox`, `oy`) in a field `fw` by `fh`: its alpha, a value a sample. */
function drawMask(op: GlassOp, size: number, font: (face: FaceId, size: number) => string, fw: number, fh: number, ox: number, oy: number): Uint8Array | null {
  maskCanvas ??= document.createElement("canvas");
  maskCanvas.width = fw * OVER;
  maskCanvas.height = fh * OVER;
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = font(op.face, size * OVER);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(op.text, ox * OVER, oy * OVER);
  const rgba = ctx.getImageData(0, 0, fw * OVER, fh * OVER).data;
  const alpha = new Uint8Array(fw * OVER * fh * OVER);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

/** Where the word's ink is, drawn from a whole pixel (`ox`, `oy`), from its start, in pixels; and that drawing. */
function inkBox(op: GlassOp, size: number, font: (face: FaceId, size: number) => string, fw: number, fh: number, ox: number, oy: number): { x0: number; x1: number; y0: number; y1: number; alpha: Uint8Array } | null {
  const alpha = drawMask(op, size, font, fw, fh, ox, oy);
  if (!alpha) return null;
  const W = fw * OVER;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] < 128) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!(x1 >= x0) || !(y1 >= y0)) return null;
  return { x0: x0 / OVER - ox, x1: (x1 + 1) / OVER - ox, y0: y0 / OVER - oy, y1: (y1 + 1) / OVER - oy, alpha };
}

/**
 * The word at `size` canvas pixels to the em, its text started on a whole
 * pixel of its layer: made once for the word at that size wherever it is
 * drawn (the shader slides it by the fraction of a pixel the canvas has it
 * at), so a word moving as more is typed round it is not made again.
 */
function prepare(op: GlassOp, size: number, font: (face: FaceId, size: number) => string): PreparedWord | null {
  watchFonts();
  // Keyed by which fonts had arrived too: a word drawn in a fallback while its face was on its way is made again once it is here.
  const key = JSON.stringify([op.text, op.face, size.toFixed(4), op.axis, fontsArrived]);
  const kept = prepared.get(key);
  if (kept) {
    prepared.delete(key);
    prepared.set(key, kept);
    return kept;
  }
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.font = font(op.face, size);
  // Only roughly where the ink is: Safari gives the advance here, not the ink (its left edge at 0 for an R that starts 7 pixels in at 200),
  // so the word is drawn with room to spare and its ink read from what is drawn.
  const m = probe.measureText(op.text);
  const spare = Math.ceil(Math.max(4, 0.15 * size));
  const margin = Math.ceil(Math.max(8, 0.12 * (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)));
  const room = spare + margin;
  const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft));
  let fw = Math.ceil(room + left + 1 + Math.max(m.width, m.actualBoundingBoxRight) + room);
  let fh = Math.ceil(room + m.actualBoundingBoxAscent + 1 + m.actualBoundingBoxDescent + room);
  if (!(fw > 0) || !(fh > 0)) return null;
  // The ink as drawn, from its start on the baseline: the flutes are set by it.
  const box = inkBox(op, size, font, fw, fh, room + left, room + Math.ceil(m.actualBoundingBoxAscent));
  if (!box) return null;
  // The field: the word and a margin round its ink (the room to spare cut off), its start a whole number of pixels in.
  const cropX = Math.max(0, Math.floor(room + left + box.x0 - margin));
  const cropY = Math.max(0, Math.floor(room + Math.ceil(m.actualBoundingBoxAscent) + box.y0 - margin));
  const fullW = fw * OVER;
  fw = Math.min(fw, Math.ceil(room + left + box.x1 + margin)) - cropX;
  fh = Math.min(fh, Math.ceil(room + Math.ceil(m.actualBoundingBoxAscent) + box.y1 + margin)) - cropY;
  const ox = room + left - cropX;
  const oy = room + Math.ceil(m.actualBoundingBoxAscent) - cropY;
  const alpha = new Uint8Array(fw * OVER * fh * OVER);
  for (let y = 0; y < fh * OVER; y += 1) {
    const from = (y + cropY * OVER) * fullW + cropX * OVER;
    alpha.set(box.alpha.subarray(from, from + fw * OVER), y * fw * OVER);
  }
  const ink = { x0: ox + box.x0, x1: ox + box.x1, y0: oy + box.y0, y1: oy + box.y1 };
  const inkW = ink.x1 - ink.x0;
  const inkH = ink.y1 - ink.y0;
  const f = FLUTES[op.axis];
  const pitch = f.pitch * size;
  // Room for the glass in the layer: the word pushed out and fringed, and its trail, along the bend; its fringe across.
  const along = Math.ceil(0.08 * (op.axis === "h" ? inkW : inkH) + (f.fadeTo + 1) * pitch + 4);
  const across = Math.ceil(0.04 * (op.axis === "h" ? inkH : inkW) + 4);
  const padX = op.axis === "h" ? along : across;
  const padY = op.axis === "h" ? across : along;
  // The layer a whole number of pixels from the field, so its pixels fall on the canvas's too.
  const fx = Math.ceil(padX - ink.x0);
  const fy = Math.ceil(padY - ink.y0);
  const w = Math.ceil(ink.x1 + fx + padX);
  const h = Math.ceil(ink.y1 + fy + padY);
  const tx = ox + fx;
  const ty = oy + fy;
  // The ink's middle in the layer: the glass is centred on it.
  const cx = fx + (ink.x0 + ink.x1) / 2;
  const cy = fy + (ink.y0 + ink.y1) / 2;
  const field = glassField(alpha, fw, fh, OVER, cx - fx, cy - fy);
  // Each layer column's ink, from the field's columns where they are.
  const extent = new Float32Array(w * 4);
  for (let x = 0; x < fw; x += 1) {
    const at = x + fx;
    if (at < 0 || at >= w) continue;
    for (let k = 0; k < 4; k += 1) extent[at * 4 + k] = field.ends[x * 4 + k];
  }
  const made: PreparedWord = { size, field, w, h, tx, ty, fx, fy, fw, fh, cx, cy, half: { x: inkW / 2, y: inkH / 2 }, extent };
  prepared.set(key, made);
  while (prepared.size > KEEP) prepared.delete(prepared.keys().next().value as string);
  return made;
}

/** Where the glass is drawn in the shared canvas: its size, and where in it the text starts, a whole pixel in. */
interface Drawn {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  tx: number;
  ty: number;
}

/**
 * The glass drawn in the shared canvas at `size` canvas pixels to the em,
 * from `word` (made at a size a hair off it), the word `frac` of a pixel
 * past a whole one; null where there is no WebGL 2.
 */
function render(op: GlassOp, word: PreparedWord, size: number, frac: { x: number; y: number }): Drawn | null {
  if (gpu === undefined) gpu = setUp();
  if (!gpu) return null;
  const { canvas, gl, uniforms: U } = gpu;
  if (gl.isContextLost()) {
    gpu = undefined;
    return null;
  }
  // The layer at this size: the word's start a whole pixel in, its ink's middle where the made word's is from its start, scaled.
  const k = size / word.size;
  const tx = Math.round(word.tx * k);
  const ty = Math.round(word.ty * k);
  const w = Math.ceil((word.w - word.tx) * k) + tx + 1;
  const h = Math.ceil((word.h - word.ty) * k) + ty + 1;
  const cx = tx + frac.x + (word.cx - word.tx) * k;
  const cy = ty + frac.y + (word.cy - word.ty) * k;
  if (canvas.width < w || canvas.height < h) {
    canvas.width = Math.max(canvas.width, w);
    canvas.height = Math.max(canvas.height, h);
  }
  if (gpu.loaded !== word) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gpu.sdf);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, word.fw, word.fh, 0, gl.RED, gl.FLOAT, word.field.sdf);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gpu.extent);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, word.w, 1, 0, gl.RGBA, gl.FLOAT, word.extent);
    // A field the GPU would not take is not drawn (the word is set as text), and not taken for loaded.
    if (gl.getError() !== gl.NO_ERROR) {
      gpu.loaded = null;
      return null;
    }
    gpu.loaded = word;
  }
  const f = FLUTES[op.axis];
  const at = op.at ?? OPEN;
  // The blur and the widest fringe in this word's pixels: as the studies had them beside "Ripple" REFERENCE_WORD_PX wide.
  const px = (size * REFERENCE_INK.w) / REFERENCE_WORD_PX;
  const one = (name: string, v: number) => gl.uniform1f(U[name], v);
  gl.uniform2f(U.uRes, w, h);
  gl.uniform2f(U.uCentre, cx, cy);
  gl.uniform2f(U.uCentreP, word.cx, word.cy);
  one("uScale", k);
  one("uLetterBend", f.letterBend);
  one("uResP", word.w);
  one("uAxis", op.axis === "h" ? 0 : 1);
  one("uHalf", (op.axis === "h" ? word.half.x : word.half.y) * k);
  one("uPitch", f.pitch * size);
  one("uCore", 0);
  one("uEdge", 1);
  one("uFan", f.fan);
  one("uFanPow", f.fanPow);
  one("uLocal", f.local ? 1 : 0);
  one("uSides", f.sides ? 1 : 0);
  one("uSqueeze", f.squeeze);
  one("uSqueezeTip", f.squeezeTip);
  one("uSqueezeEcho", f.squeezeEcho);
  one("uCurve", f.curve);
  one("uBendFloor", f.bendFloor);
  one("uEchoes", f.echoes);
  one("uFadeTo", f.fadeTo);
  one("uEchoAnchor", f.echoAnchor);
  one("uEchoStep", f.echoStep);
  one("uEchoFade", f.echoFade);
  one("uEchoSoft", f.echoSoft * px);
  one("uBow", f.bow);
  one("uBowOut", f.bowOut);
  one("uReachNow", at.reach);
  one("uFace", f.face);
  one("uKappaOut", f.kappaOut);
  one("uKappaFan", f.kappaFan);
  one("uKappaB", f.kappaB);
  one("uDisp", at.colour);
  one("uFlash", 0.35);
  one("uS", at.glass);
  one("uV", at.speed);
  one("uFmax", f.fmax * px);
  one("uSoftSplit", 0.022);
  one("uSoftMax", 1.6 * px);
  one("uSigma0", 0.55);
  one("uSigma1", 0.6 * px);
  one("uExposure", EXPOSURE);
  one("uToneNorm", TONE_NORM);
  gl.uniform2f(U.uSpanL, word.field.first[0] * k, word.field.first[1] * k);
  gl.uniform2f(U.uSpanR, word.field.last[0] * k, word.field.last[1] * k);
  const ink = linear(op.color);
  const ground = linear(op.ground);
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // The split light at full strength for letters as far from the ground as white (or black) is, and calmer as they come nearer it,
  // so a deep red's crescents read as red with a fringe of the poster's colours, not as coloured outlines.
  const lighter = lum(ink) >= lum(ground);
  const contrast = Math.abs(lum(ink) - lum(ground)) / Math.max(1e-6, lighter ? 1 - lum(ground) : lum(ground));
  // As far from its ground as white or black are, near enough: the palette's whites are faintly tinted, and keep the glass exactly as approved.
  const near = Math.min(1, contrast / FULL_CONTRAST);
  one("uLight", (lighter ? 1 : -1) * (FRINGE_LEAST + (1 - FRINGE_LEAST) * near));
  one("uContrast", near);
  one("uLift", LIFT_LEAST + (1 - LIFT_LEAST) * near);
  gl.uniform3fv(U.uInk, new Float32Array(ink));
  gl.uniform3fv(U.uGround, new Float32Array(ground));
  gl.uniform3fv(U.uGroundSrgb, new Float32Array(rgb(op.ground).map((c) => c / 255)));
  gl.uniform4f(U.uSdfRect, word.fx, word.fy, 1 / word.fw, 1 / word.fh);
  gl.viewport(0, 0, w, h);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return { canvas, w, h, tx, ty };
}

/** A word this far from its ground (of as far as white, or black, can be) has the glass at full: its light as the studies had it. */
const FULL_CONTRAST = 0.85;

/** How far a word barely lighter (or darker) than its ground has its half-seen light lifted, as a power: white's is 1, as it is. */
const LIFT_LEAST = 0.6;

/** The ladder of sizes a word's field is made at: a hundredth apart, so a size between two is scaled from the nearer by half a hundredth at most. */
const RUNG = Math.log(1.01);

/** How strong the split light's colours are on letters barely lighter (or darker) than their ground, against white's (or black's) full strength. */
const FRINGE_LEAST = 0.55;

/** The part of a 2D context the glass is drawn with. */
type GlassTarget = Pick<CanvasRenderingContext2D, "save" | "restore" | "setTransform" | "drawImage"> & Partial<Pick<CanvasRenderingContext2D, "getTransform">>;

/**
 * The glass op drawn on `ctx` where its transform puts it; false where it
 * cannot be (no WebGL 2, a stand-in context, an empty word), and the word
 * must be set as text instead.
 */
export function drawGlass(ctx: GlassTarget, op: GlassOp, font: (face: FaceId, size: number) => string): boolean {
  const m = ctx.getTransform?.();
  if (!m || typeof document === "undefined") return false;
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  if (!(scale > 1e-3)) return false;
  // A word scaled up past `LARGEST` (a text box pulled big) is drawn at that size and enlarged with the rest, as a picture: its field and layer stay within what a canvas and a GPU take.
  const shrink = Math.min(1, LARGEST / (op.size * scale));
  // Not turned, flipped or enlarged: drawn at the canvas's own pixels. Otherwise in the letters' frame, at their scale.
  const upright = shrink === 1 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && m.d > 0 && Math.abs(m.a - m.d) < 1e-6 * m.a;
  const k = (upright ? m.a : scale) * shrink;
  const size = op.size * k;
  const at = { x: m.a * op.x + m.c * op.y + m.e, y: m.b * op.x + m.d * op.y + m.f };
  const frac = upright ? { x: at.x - Math.floor(at.x), y: at.y - Math.floor(at.y) } : { x: 0, y: 0 };
  // Made at a size on a ladder a hundredth apart, and drawn at its own: as more is typed and the word shrinks a little, it is not made again.
  const made = Math.exp(Math.round(Math.log(size) / RUNG) * RUNG);
  let drawn: Drawn | null = null;
  try {
    const word = prepare(op, made, font);
    drawn = word && render(op, word, size, frac);
  } catch {
    // Anything the page cannot make (memory, a canvas too big): the word is set as text.
    drawn = null;
  }
  if (!drawn) return false;
  const sy = drawn.canvas.height - drawn.h;
  ctx.save();
  if (upright) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(drawn.canvas, 0, sy, drawn.w, drawn.h, Math.floor(at.x) - drawn.tx, Math.floor(at.y) - drawn.ty, drawn.w, drawn.h);
  } else {
    ctx.drawImage(drawn.canvas, 0, sy, drawn.w, drawn.h, op.x - drawn.tx / k, op.y - drawn.ty / k, drawn.w / k, drawn.h / k);
  }
  ctx.restore();
  return true;
}
