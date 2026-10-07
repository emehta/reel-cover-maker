import type { Metadata } from "next";
import Stage from "@/cover/Stage";

export const metadata: Metadata = { title: "Reelic cover stage", robots: { index: false } };

/** The projects card's cover, drawn frame by frame for a renderer: never published (the stage is not committed to main). */
export default function CoverPage() {
  return <Stage />;
}
