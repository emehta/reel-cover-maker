/// <reference lib="webworker" />

/**
 * Makes liquid letters' fields off the page's thread: one takes a few
 * hundred milliseconds at full size, which typing would otherwise feel.
 */

import { liquidField, type LiquidPaint, type LiquidTarget } from "@/components/reel-cover-maker/liquid-render";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<{ id: number; paint: LiquidPaint; target: LiquidTarget }>) => {
  const { id, paint, target } = event.data;
  try {
    const field = liquidField(paint, target);
    if (field) self.postMessage({ id, field }, [field.data.buffer]);
    else self.postMessage({ id, field: null });
  } catch (error) {
    self.postMessage({ id, field: null, error: String(error) });
  }
};
