/**
 * A photo's colour adjusted on the GPU: the arithmetic of `channelCurve`
 * and `colourMatrix` in photo.ts, line for line, so a slider dragged lights
 * the whole photo again in a millisecond. Where there is no WebGL 2 the
 * page does it with photo.ts's tables instead (`adjustedPhoto`).
 */

import { adjustPixels, balanceGains, colourMatrix, isNeutral, type PhotoAdjust } from "@/components/reel-cover-maker/photo";

const VERTEX = `#version 300 es
in vec2 aCorner;
out vec2 vUv;
void main() {
  vUv = vec2((aCorner.x + 1.0) * 0.5, 1.0 - (aCorner.y + 1.0) * 0.5);
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uPhoto;
uniform float uExposure;
uniform vec3 uGains;
uniform float uBrightness;
uniform float uContrast;
uniform mat3 uMatrix;
in vec2 vUv;
out vec4 outColor;

vec3 toLinear(vec3 v) { return mix(v / 12.92, pow((v + 0.055) / 1.055, vec3(2.4)), step(0.04045, v)); }
vec3 toSrgb(vec3 v) {
  v = clamp(v, 0.0, 1.0);
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
}

void main() {
  vec4 p = texture(uPhoto, vUv);
  vec3 x = toSrgb(toLinear(p.rgb) * exp2(uExposure) * uGains);
  x = uBrightness >= 0.0 ? x + (1.0 - x) * uBrightness * 0.6 : x * (1.0 + uBrightness * 0.6);
  x = clamp((x - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);
  outColor = vec4(clamp(uMatrix * x, 0.0, 1.0), 1.0);
}`;

interface Gpu {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  texture: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
  /** The photo now in the texture, so it is sent to the GPU once, not on every slider move. */
  source: CanvasImageSource | null;
  /** The adjustments the canvas holds now, so a paint that changes nothing draws nothing again. */
  key: string;
}

let gpu: Gpu | null | undefined;

function setUp(): Gpu | null {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) return null;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX);
    const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const names = ["uPhoto", "uExposure", "uGains", "uBrightness", "uContrast", "uMatrix"];
    const uniforms = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      gpu = null;
    });
    return { canvas, gl, texture, uniforms, source: null, key: "" };
  } catch {
    return null;
  }
}

/** The photo adjusted on the GPU into its own canvas (shared, so drawn from before the next photo is adjusted); null without WebGL 2. */
function onGpu(photo: CanvasImageSource, w: number, h: number, adjust: PhotoAdjust): HTMLCanvasElement | null {
  if (gpu === undefined) gpu = setUp();
  if (!gpu) return null;
  const { canvas, gl, texture, uniforms } = gpu;
  if (gl.isContextLost()) {
    gpu = null;
    return null;
  }
  if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < Math.max(w, h)) return null;
  const key = `${w}x${h}|${JSON.stringify(adjust)}`;
  if (gpu.source === photo && gpu.key === key) return canvas;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (gpu.source !== photo) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo as TexImageSource);
    gpu.source = photo;
  }
  // GLSL's mat3 is filled column by column; colourMatrix is row by row.
  const m = colourMatrix(adjust);
  gl.uniform1i(uniforms.uPhoto, 0);
  gl.uniform1f(uniforms.uExposure, adjust.exposure);
  gl.uniform3fv(uniforms.uGains, new Float32Array(balanceGains(adjust)));
  gl.uniform1f(uniforms.uBrightness, adjust.brightness);
  gl.uniform1f(uniforms.uContrast, adjust.contrast);
  gl.uniformMatrix3fv(uniforms.uMatrix, false, new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gpu.key = key;
  return canvas;
}

let cpu: { source: CanvasImageSource; key: string; canvas: HTMLCanvasElement } | null = null;

/**
 * The photo as adjusted, ready to draw: the photo itself when nothing is
 * adjusted, else the GPU's canvas, else a canvas the page adjusted (kept,
 * since that is slow, until the photo or the adjustments change).
 */
export function adjustedPhoto(photo: CanvasImageSource, w: number, h: number, adjust: PhotoAdjust): CanvasImageSource {
  if (isNeutral(adjust)) return photo;
  const gpuCanvas = onGpu(photo, w, h, adjust);
  if (gpuCanvas) return gpuCanvas;
  const key = JSON.stringify(adjust);
  if (cpu && cpu.source === photo && cpu.key === key) return cpu.canvas;
  const canvas = cpu?.source === photo ? cpu.canvas : document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return photo;
  ctx.drawImage(photo, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  adjustPixels(image.data, adjust);
  ctx.putImageData(image, 0, 0);
  cpu = { source: photo, key, canvas };
  return canvas;
}
