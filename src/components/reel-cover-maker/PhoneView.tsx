"use client";

import { BatteryFull, CaretDown, CellSignalFull, FilmSlate, GridNine, House, List, MagnifyingGlass, PlusSquare, UserSquare, WifiHigh } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { GROUNDS, type Ground } from "@/components/reel-cover-maker/palettes";
import profile from "@/components/reel-cover-maker/posts/profile.jpg";
import reel1 from "@/components/reel-cover-maker/posts/reel-1.jpg";
import reel2 from "@/components/reel-cover-maker/posts/reel-2.jpg";
import reel3 from "@/components/reel-cover-maker/posts/reel-3.jpg";
import reel4 from "@/components/reel-cover-maker/posts/reel-4.jpg";
import { BEZEL, GRID_COLUMNS, GRID_GAP, GRID_ROWS, NAV_BAR, PHONE_HEIGHT, PHONE_WIDTH, SAFE_BOTTOM, SAFE_TOP, SCREEN_RADIUS, TAB_BAR, TABS_BAR, gridArea } from "@/components/reel-cover-maker/phone";

interface Props {
  /** The cover as the grid shows it: a canvas of its 3:4 window. */
  tile: ReactNode;
  /** A reel, marked in the grid as one is. */
  reel: boolean;
  /** The ground chosen, under a cover that is clear but for its letters. */
  ground: Ground;
  /** Over the screen: what a file dragged over the preview would do. */
  children?: ReactNode;
}

/** Whose profile it is: the owner's own account (asked for on 7 Oct), public, so with no lock by its name. */
const HANDLE = "eshaan.tm";

/** The cover's place among the posts drawn: the middle row's middle. */
const COVER_AT = Math.floor(GRID_ROWS / 2) * GRID_COLUMNS + Math.floor(GRID_COLUMNS / 2);

/**
 * The owner's own reels on @eshaan.tm, newest first, their covers as
 * Instagram served them on 7 Oct (all four the account had), shown at the
 * grid's 3:4 middle as the grid shows a reel. A new post goes first, so
 * they follow the cover; the grid ends after the last of them. The tiles
 * before the cover stand for posts still to come.
 */
const POSTS = [
  { src: reel1.src, name: "Apple Iphone 5 Ad (2013)" },
  { src: reel2.src, name: "Match Group's Hail Mary" },
  { src: reel3.src, name: "The Grammys (and Instagrams like count)" },
  { src: reel4.src, name: "Most apps you use are Chocolate-covered Broccoli" },
];

/**
 * The cover among a profile's posts, on a phone, all of it to scale
 * (phone.ts): the whole screen in sight, every bar where it is, the cover
 * in the middle of the grid, the posts round it quiet tiles. As large as
 * the preview has room for, and never larger than the phone itself, at a
 * point to a pixel. Light or dark with the system, as the app is.
 */
export function PhoneView({ tile, reel, ground, children }: Props) {
  const area = gridArea();
  const size = {
    "--rcm-phone-w": PHONE_WIDTH,
    "--rcm-phone-h": PHONE_HEIGHT,
    "--rcm-phone-bezel": BEZEL,
    "--rcm-phone-radius": SCREEN_RADIUS,
    "--rcm-phone-top": SAFE_TOP,
    "--rcm-phone-nav": NAV_BAR,
    "--rcm-phone-tabs": TABS_BAR,
    "--rcm-phone-grid-top": area.top,
    "--rcm-phone-grid-bottom": PHONE_HEIGHT - area.bottom,
    "--rcm-phone-bar": TAB_BAR,
    "--rcm-phone-home": SAFE_BOTTOM,
    "--rcm-phone-gap": GRID_GAP,
    "--rcm-phone-columns": GRID_COLUMNS,
  } as CSSProperties;
  return (
    <div className={styles.phone} style={size}>
      <div className={styles.phoneScreen}>
        <div className={styles.phoneStatus} aria-hidden="true">
          <span className={styles.phoneTime}>9:41</span>
          <span className={styles.phoneIsland} />
          <span className={styles.phoneSignals}>
            <CellSignalFull weight="fill" />
            <WifiHigh weight="bold" />
            <BatteryFull weight="fill" />
          </span>
        </div>
        <div className={styles.phoneNav} aria-hidden="true">
          <span className={styles.phoneName}>
            {HANDLE}
            <CaretDown weight="bold" />
          </span>
          <span className={styles.phoneIcons}>
            <PlusSquare />
            <List />
          </span>
        </div>
        <div className={styles.phoneTabs} aria-hidden="true">
          <span data-on="">
            <GridNine />
          </span>
          <span>
            <FilmSlate />
          </span>
          <span>
            <UserSquare />
          </span>
        </div>
        <div className={styles.phoneGridArea}>
          <div className={styles.phoneGrid} role="img" aria-label="The cover in the middle of a profile grid, on a phone drawn to scale">
            {Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, i) =>
              i === COVER_AT ? (
                <div key={i} className={styles.phoneTile} style={{ background: GROUNDS[ground] }}>
                  {tile}
                  {reel && <ReelMark />}
                </div>
              ) : (
                i < COVER_AT ? (
                  <div key={i} className={styles.phoneTile} data-tone={(i * 7) % 4} />
                ) : POSTS[i - COVER_AT - 1] ? (
                  <div key={i} className={styles.phoneTile}>
                    {/* A reel's cover, at the grid's window of it: next/image has nothing to add to a picture this small. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.phonePost} src={POSTS[i - COVER_AT - 1].src} alt="" />
                    <ReelMark />
                  </div>
                ) : (
                  // Past the last post, the profile has nothing more.
                  <div key={i} className={styles.phoneTile} data-empty="" />
                )
              ),
            )}
          </div>
        </div>
        <div className={styles.phoneBar} aria-hidden="true">
          <House />
          <MagnifyingGlass />
          <PlusSquare />
          <FilmSlate />
          {/* The owner's own picture, in the ring the profile's tab is chosen by. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.phoneMe} src={profile.src} alt="" />
        </div>
        <span className={styles.phoneHome} aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/** A reel, marked at its post's corner as the grid marks one. */
function ReelMark() {
  return (
    <svg className={styles.phoneReel} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 8.5h18M9 3l3 5.5M14.5 3l3 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 11.6v5.3c0 .5.5.8.9.5l4.2-2.6c.4-.3.4-.8 0-1.1l-4.2-2.6c-.4-.3-.9 0-.9.5Z" fill="currentColor" />
    </svg>
  );
}
