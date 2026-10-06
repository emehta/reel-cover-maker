/// <reference lib="webworker" />

/**
 * Draws liquid letters off the page's thread: a layer takes a few hundred
 * milliseconds at full size, which typing would otherwise feel.
 */

import { renderLiquid, type LiquidPaint, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<{ id: number; paint: LiquidPaint; target: LiquidTarget }>) => {
  const { id, paint, target } = event.data;
  try {
    const image = renderLiquid(paint, target);
    if (image) self.postMessage({ id, image }, [image.data.buffer]);
    else self.postMessage({ id, image: null });
  } catch (error) {
    self.postMessage({ id, image: null, error: String(error) });
  }
};
