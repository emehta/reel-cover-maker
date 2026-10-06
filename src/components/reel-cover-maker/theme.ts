/**
 * Light and dark, after the system: the maker is a tool, and keeps no switch
 * of its own.
 *
 * The page's first frame must already be the right colour, before any of the
 * maker's code has loaded, and so must the browser's bars and the strip a
 * phone shows when the page is pulled past its end. So `prepaintScript` is
 * inlined into the page and paints `<html>`, the body and `theme-color` as
 * the browser parses it, and the maker keeps them in step while it is open
 * and hands them back when it closes.
 */

export type Theme = "light" | "dark";

/** The page behind everything, as the stylesheet's `--rcm-bg` has it. */
export const BACKDROP: Record<Theme, string> = { light: "#F3F2EF", dark: "#121212" };

const META_ATTRIBUTE = "data-reel-cover-maker";

/**
 * Inlined first in the page, before the maker's code has loaded. The same
 * steps as `applyBackdrop`, written out because an inlined script cannot
 * import. A site the maker is played on may hand `<html>` back to its own
 * stylesheet once the page has loaded, so it paints again then. The tag goes
 * first in the head, because a browser reads the first `theme-color` it finds.
 */
export const prepaintScript = `(function () {
  try {
    var apply = function () {
      var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var colour = dark ? ${JSON.stringify(BACKDROP.dark)} : ${JSON.stringify(BACKDROP.light)};
      var root = document.documentElement;
      root.style.backgroundColor = colour;
      root.style.colorScheme = dark ? "dark" : "light";
      if (document.body) document.body.style.backgroundColor = colour;
      var meta = document.querySelector('meta[name="theme-color"][${META_ATTRIBUTE}]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        meta.setAttribute("${META_ATTRIBUTE}", "");
        document.head.insertBefore(meta, document.head.firstChild);
      }
      meta.setAttribute("content", colour);
    };
    apply();
    window.addEventListener("load", apply, { once: true });
  } catch (_) {}
})();`;

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Paint the page and the browser's bars for the system's light or dark. */
export function applyBackdrop(): void {
  const theme = systemTheme();
  const colour = BACKDROP[theme];
  const root = document.documentElement;
  root.style.backgroundColor = colour;
  root.style.colorScheme = theme;
  document.body.style.backgroundColor = colour;
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="theme-color"][${META_ATTRIBUTE}]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute(META_ATTRIBUTE, "");
    document.head.prepend(meta);
  }
  meta.content = colour;
}

/** Hand the page and the bars back, for whatever page comes next. */
export function clearBackdrop(): void {
  const root = document.documentElement;
  root.style.removeProperty("background-color");
  root.style.removeProperty("color-scheme");
  document.body.style.removeProperty("background-color");
  document.querySelector(`meta[name="theme-color"][${META_ATTRIBUTE}]`)?.remove();
}
