/**
 * Getting the picture out of the browser and into the camera roll.
 *
 * A computer downloads it, and so does Android, whose downloads Instagram's
 * picker finds. An iPhone cannot save a download to Photos (iOS puts it in
 * Files, where Instagram's cover picker never looks), so where the browser
 * can share a file, the share sheet is opened instead and "Save Image" puts
 * it in Photos. Inside an app's own browser (Instagram's, when the link is
 * opened from a bio) neither may work, so the picture is shown on its own to
 * be pressed and held.
 *
 * The file is PNG: lossless, so Instagram's own JPEG encoding is the only
 * one the cover goes through, and exactly 1080 pixels wide, so Instagram
 * never resamples it.
 */

import { formatById, type FormatId } from "@/components/reel-cover-maker/formats";
import { plainTitle } from "@/components/reel-cover-maker/title";

export type SaveMethod = "share" | "download" | "hold";

export const FILE_TYPE = "image/png";

/** The longest a name's title part may run, so the name fits a share sheet. */
const NAME_LENGTH = 48;

/** A file name from the title: "how-i-plan-my-week-reel-cover.png". */
export function fileName(title: string, format: FormatId): string {
  const slug = plainTitle(title)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_LENGTH)
    .replace(/-+$/g, "");
  const suffix = formatById(format).fileSuffix;
  return `${slug ? `${slug}-` : ""}${suffix}.png`;
}

/** The browsers inside apps, which neither download nor always share. */
export function isInAppBrowser(userAgent: string): boolean {
  return /\b(Instagram|FBAN|FBAV|FB_IAB|Line\/|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Twitter)\b/i.test(userAgent);
}

export function isAndroid(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
}

export interface SaveEnvironment {
  /** `navigator.canShare({ files })` for a PNG. */
  canShareFiles: boolean;
  /** A touch screen is the main pointer: a phone or a tablet. */
  touch: boolean;
  /**
   * Android's share sheet lists apps, with no "save to gallery" among them,
   * while a download lands in Downloads, where Instagram's picker finds it.
   */
  android: boolean;
  inAppBrowser: boolean;
}

/** How this browser should hand over the picture. */
export function saveMethod(env: SaveEnvironment): SaveMethod {
  if (env.touch && env.canShareFiles && !env.android) return "share";
  if (env.inAppBrowser) return "hold";
  return "download";
}
