import { QueueAlbumDetail } from "@app/features/sandbox/QueueCoverflow/QueueAlbumDetail";
import { PartStage } from "./PartStage";

export const name = "Album — Marquee";
export const note =
  "Album detail, marquee variation (tracklist never default).";

export default function AlbumMarqueeTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueAlbumDetail variant="marquee" />
    </PartStage>
  );
}
