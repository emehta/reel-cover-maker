/**
 * Light on paste, on the GPU.
 *
 * The worker hands over a field (liquid-render.ts): for every pixel, how
 * deep inside the paste it is, how high the paste stands, its colour's
 * index and tone. Here that is lit, every time a canvas is painted, so a
 * colour dragged on its slider is light again in a millisecond or two,
 * never paste again.
 *
 * - Gel (Pasty): a studio reflected in a wet surface (a large softbox up
 *   and to the left, a strip light to the right), in proportion to how
 *   glancing the surface is (Fresnel), so gel catches the light at its
 *   edges as gel does; a body that absorbs more the thicker it is (Beer and
 *   Lambert), so thin gel is light and saturated and shows the ground
 *   through it while thick gel is deep; light scattered inside the core;
 *   a sharp specular; a shadow traced across the paste's real height
 *   toward the light, soft with distance, and tinted, because the light
 *   that reaches it has passed through the gel.
 * - Matte paste (Pasty Flat): soft light, darker in the knife's
 *   grooves, a shadow of its own across its ridges, a faint sheen, and an
 *   opaque shadow on the ground.
 * - Flat (Stickery's liquid words): the colour alone.
 *
 * One WebGL 2 context draws every layer of every canvas: each is drawn into
 * it and copied out at once. Without WebGL 2 (or with the context lost),
 * `shadeField` in liquid-render.ts lights the field instead.
 */

import type { LiquidField, Shading } from "@/components/reel-cover-maker/liquid-render";
import { rgb } from "@/components/reel-cover-maker/palettes";

const VERTEX = `#version 300 es
in vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D uField;
uniform vec3 uColours[4];
uniform vec3 uGround;
uniform int uHasGround;
uniform int uShadow;
uniform int uFinish;
uniform float uRadius;
uniform ivec2 uSize;
uniform float uSeed;
out vec4 outColor;

const vec3 L = vec3(-0.3495, -0.4993, 0.7928);
const vec3 V = vec3(0.0, 0.0, 1.0);

uvec4 at(ivec2 p) { return texelFetch(uField, clamp(p, ivec2(0), uSize - 1), 0); }
float heightAt(ivec2 p) { return float(at(p).g) / 256.0; }

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float ggx(float nh, float a) {
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159 * d * d);
}

// The studio a wet surface reflects, in light far brighter than the paste
// itself (as a photograph's highlights are): a large softbox up and to the
// left, its brighter middle, a thin strip light to the right, a dim room,
// and toward the horizon the lit table the paste stands on.
vec3 studio(vec3 r, vec3 table) {
  float box = smoothstep(0.80, 0.90, dot(r, normalize(vec3(-0.40, -0.56, 0.72))));
  float hot = smoothstep(0.955, 0.985, dot(r, normalize(vec3(-0.36, -0.52, 0.77))));
  float strip = smoothstep(0.93, 0.975, dot(r, normalize(vec3(0.80, 0.10, 0.59))));
  float room = 0.05 + 0.08 * clamp(r.z, 0.0, 1.0);
  float horizon = 1.0 - smoothstep(0.0, 0.45, r.z);
  return vec3(room) + vec3(box * 5.0 + hot * 7.0 + strip * 1.6) + table * 0.55 * horizon;
}

// How much of the light, from up and to the left, is cut off at p (at a
// height h) by paste standing between it and the light.
float shadowAt(ivec2 p, float h) {
  vec2 toward = normalize(L.xy);
  float rise = L.z / length(L.xy);
  float cut = 0.0;
  for (int i = 1; i <= 22; i++) {
    float t = float(i) * uRadius * 0.13;
    float q = heightAt(p + ivec2(round(toward * t)));
    if (q <= 0.0) continue;
    float ray = h + t * rise;
    float soft = uRadius * 0.06 + t * 0.32;
    cut = max(cut, smoothstep(-soft, soft, q - ray));
  }
  return cut;
}

void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), uSize.y - 1 - int(gl_FragCoord.y));
  uvec4 f = at(p);
  float d = float(f.r) / 256.0 - 128.0;
  float h = float(f.g) / 256.0;
  vec3 C = clamp(uColours[min(int(f.b), 3)] * (float(f.a) / 1000.0), vec3(0.0005), vec3(1.0));
  // The edge by the depth's own slope: where two shapes blend, the depth
  // climbs slowly, and an edge read off it unscaled smears over pixels. A
  // distance never climbs faster than a pixel a pixel: where it seems to,
  // it is the edge of where the depth was worked out, far from any paste,
  // and read as an edge it drew a faint line there on a small canvas.
  float dx = (float(at(p + ivec2(1, 0)).r) - float(at(p - ivec2(1, 0)).r)) / 512.0;
  float dy = (float(at(p + ivec2(0, 1)).r) - float(at(p - ivec2(0, 1)).r)) / 512.0;
  float slope = clamp(length(vec2(dx, dy)), 0.25, 1.0);
  // A pixel and a half of smooth edge, so a curve never steps.
  float cover = smoothstep(-0.75, 0.75, d / slope);

  // What the ground (or a photo, multiplied by it) is darkened by here: the
  // paste's shadow. Light reaching the ground through gel is coloured by
  // it, so its shadow is a soft stain of its colour, never a grey drop.
  vec3 shade = vec3(1.0);
  float cut = 0.0;
  float contact = 0.0;
  if (uFinish != 1 && cover < 1.0) {
    cut = shadowAt(p, 0.0);
    contact = exp(-max(0.0, -d) / (uRadius * 0.26));
    vec3 tint = mix(vec3(1.0), clamp(C * 1.6, 0.0, 1.0), 0.75);
    shade = mix(vec3(1.0), tint * 0.82, cut * 0.7) * (1.0 - 0.22 * contact);
  }
  if (uShadow == 1) {
    outColor = vec4(encode(shade), 1.0);
    return;
  }
  vec3 paste = vec3(0.0);

  if (cover > 0.0) {
    if (uFinish == 1) {
      paste = C;
    } else {
      float hx = (heightAt(p + ivec2(1, 0)) - heightAt(p - ivec2(1, 0))) * 0.5;
      float hy = (heightAt(p + ivec2(0, 1)) - heightAt(p - ivec2(0, 1))) * 0.5;
      vec3 N = normalize(vec3(-hx, -hy, 1.0));
      float nl = dot(N, L);
      vec3 H = normalize(L + V);
      float nh = max(dot(N, H), 0.0);
      float nv = max(N.z, 0.0);
      float thick = clamp(h / (uRadius * 0.9), 0.0, 1.6);
      // Gel: a body that absorbs more the deeper light goes into it, so
      // a blob is darker and richer than a thin stroke; lit softly from
      // above, and glowing a little where light scatters in its core.
      vec3 table = uHasGround == 1 ? uGround : vec3(0.8);
      float wrap = clamp((nl + 0.4) / 1.4, 0.0, 1.0);
      vec3 deep = pow(C, vec3(0.75 + 0.9 * thick));
      vec3 body = deep * (0.16 + 0.84 * wrap);
      body += C * C * 0.22 * smoothstep(0.35, 1.2, thick) * wrap;
      // A wet surface: what it reflects, by Schlick's Fresnel, weighs more
      // the more glancing it is; the paste's own colour weighs the rest.
      float fresnel = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
      vec3 reflected = studio(reflect(-V, N), table);
      float spec = ggx(nh, 0.04) * 0.06;
      paste = body * (1.0 - fresnel) + reflected * fresnel + vec3(spec);
    }
  }

  if (uHasGround == 0) {
    outColor = vec4(encode(paste) * cover, cover);
    return;
  }
  vec3 ground = uGround * shade;
  // Flat paste has no soft shadow to band, so no dither: one colour, exactly.
  bool touched = uFinish != 1 && (cover > 0.0 || cut > 0.002 || contact > 0.002);
  // The edge blended as it is seen, in the display's own values, as type
  // is: blended in linear light, a pale paste on a dark ground came out
  // nearly whole in a pixel only partly covered, and its curves stepped.
  // A dither of under half a level, against banding in the soft shadows,
  // and only where the paste is or falls: the bare ground stays exactly the
  // cover's own colour, so the layer's edge never shows.
  vec3 colour = mix(encode(ground), encode(paste), cover);
  if (touched) colour += (hash(vec2(p) + uSeed) - 0.5) * (0.9 / 255.0);
  outColor = vec4(colour, 1.0);
}`;

interface Gpu {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

let gpu: Gpu | null | undefined;

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
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const names = ["uField", "uColours", "uGround", "uHasGround", "uShadow", "uFinish", "uRadius", "uSize", "uSeed"];
    const uniforms = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      gpu = null;
    });
    return { canvas, gl, program, texture, uniforms };
  } catch {
    return null;
  }
}

const linear = (hex: string) =>
  rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

const FINISH = { gloss: 0, flat: 1 } as const;

/** Where in the shared canvas a lit layer is: its top left corner, the field's size. */
export interface GpuLayer {
  canvas: HTMLCanvasElement;
  sx: number;
  sy: number;
}

/**
 * The field lit on the GPU, in the shared canvas, to be copied out before
 * the next layer is lit; null where there is no WebGL 2. The canvas only
 * ever grows, so lighting the preview and then each thumbnail never
 * reallocates it: each is drawn in its bottom left corner (the GL origin),
 * which is `sx`, `sy` down from the canvas's top left.
 */
export function shadeOnGpu(field: LiquidField, shading: Shading, seed: number): GpuLayer | null {
  if (gpu === undefined) gpu = setUp();
  if (!gpu) return null;
  const { canvas, gl, uniforms, texture } = gpu;
  if (gl.isContextLost()) {
    gpu = null;
    return null;
  }
  if (canvas.width < field.w || canvas.height < field.h) {
    canvas.width = Math.max(canvas.width, field.w);
    canvas.height = Math.max(canvas.height, field.h);
  }
  gl.viewport(0, 0, field.w, field.h);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, 0, field.w, field.h);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, field.w, field.h, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, field.data);
  const colours = [0, 1, 2, 3].flatMap((i) => linear(shading.colours[i] ?? shading.colours[0]));
  gl.uniform1i(uniforms.uField, 0);
  gl.uniform3fv(uniforms.uColours, new Float32Array(colours));
  gl.uniform3fv(uniforms.uGround, new Float32Array(shading.ground ? linear(shading.ground) : [0, 0, 0]));
  gl.uniform1i(uniforms.uHasGround, shading.ground ? 1 : 0);
  gl.uniform1i(uniforms.uShadow, shading.shadow ? 1 : 0);
  gl.uniform1i(uniforms.uFinish, FINISH[field.finish]);
  gl.uniform1f(uniforms.uRadius, Math.max(0.5, field.radius));
  gl.uniform2i(uniforms.uSize, field.w, field.h);
  gl.uniform1f(uniforms.uSeed, seed % 1000);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return { canvas, sx: 0, sy: canvas.height - field.h };
}
