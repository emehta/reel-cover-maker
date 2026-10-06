import type { Metadata } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/components/reel-cover-maker/meta";
import ReelCoverMakerLoader from "@/components/reel-cover-maker/ReelCoverMakerLoader";
import ReelCoverMakerPrepaint from "@/components/reel-cover-maker/ReelCoverMakerPrepaint";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default function Home() {
  return (
    <>
      <ReelCoverMakerPrepaint />
      <ReelCoverMakerLoader />
    </>
  );
}
