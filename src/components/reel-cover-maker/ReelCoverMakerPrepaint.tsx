import { prepaintScript } from "@/components/reel-cover-maker/theme";

/**
 * Put first in the page: paints it light or dark before the first frame, so
 * the page never flashes the other colour while the maker loads.
 */
export default function ReelCoverMakerPrepaint() {
  return <script dangerouslySetInnerHTML={{ __html: prepaintScript }} />;
}
