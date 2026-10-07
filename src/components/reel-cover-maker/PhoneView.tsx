"use client";

import { BatteryFull, CaretDown, CellSignalFull, FilmSlate, GridNine, List, Lock, PlusSquare, UserSquare, WifiHigh } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
import { GRID_COLUMNS, GRID_GAP, PHONE_WIDTH } from "@/components/reel-cover-maker/phone";

/** The posts round the cover: enough rows to fill the tallest preview. */
const OTHERS = 8;

interface Props {
  /** The cover as the grid shows it: a canvas of its 3:4 window. */
  tile: ReactNode;
  /** A reel, marked in the grid as one is. */
  reel: boolean;
  /** Over the screen: what a file dragged over the preview would do. */
  children?: ReactNode;
}

/**
 * The cover as the newest post of a profile, on a phone, in the phone's own
 * points (phone.ts): the profile scrolled to its grid, with its name and
 * tabs held at the top as they are, and the posts before it as quiet
 * tiles. At its real width wherever the preview has the room, and only
 * ever made smaller to fit. Light or dark with the system, as the app is.
 */
export function PhoneView({ tile, reel, children }: Props) {
  const size = { "--rcm-phone-w": PHONE_WIDTH, "--rcm-phone-gap": GRID_GAP, "--rcm-phone-columns": GRID_COLUMNS } as CSSProperties;
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
            <Lock weight="bold" />
            your.account
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
        <div className={styles.phoneGrid} role="img" aria-label="The cover as the newest post in a profile grid, at a phone's size">
          <div className={styles.phoneTile}>
            {tile}
            {reel && (
              // A reel is marked at its corner, as the grid marks one.
              <svg className={styles.phoneReel} viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M3 8.5h18M9 3l3 5.5M14.5 3l3 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M10 11.6v5.3c0 .5.5.8.9.5l4.2-2.6c.4-.3.4-.8 0-1.1l-4.2-2.6c-.4-.3-.9 0-.9.5Z" fill="currentColor" />
              </svg>
            )}
          </div>
          {Array.from({ length: OTHERS }, (_, i) => (
            <div key={i} className={styles.phoneTile} data-tone={i % 4} />
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
