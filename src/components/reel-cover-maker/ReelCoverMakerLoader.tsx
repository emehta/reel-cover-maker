"use client";

import dynamic from "next/dynamic";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";
// Imported here, on the page itself, so the faces' CSS and preloads arrive with the HTML.
import { interTight } from "@/components/reel-cover-maker/fonts";

/**
 * The maker runs in the browser only: it draws on a canvas and reads what
 * this browser remembers, and neither exists on the server. Until it arrives
 * the page is the maker's own backdrop, never the colour of the site around it.
 */
const ReelCoverMaker = dynamic(() => import("@/components/reel-cover-maker/ReelCoverMaker"), {
  ssr: false,
  loading: () => <main className={`${styles.root} ${interTight.variable}`} aria-busy="true" />,
});

export default function ReelCoverMakerLoader() {
  return <ReelCoverMaker />;
}
