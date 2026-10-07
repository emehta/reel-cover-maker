/** What the page asks of the device it is on, for useSyncExternalStore: nothing it says changes while the page is open. */

export const subscribeNothing = () => () => {};

/** A Mac, an iPhone or an iPad, whose shortcuts are Cmd's rather than Ctrl's. */
export function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || navigator.userAgent.includes("Mac OS");
}
