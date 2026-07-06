import { QueueAlbumDetail } from "@app/features/sandbox/QueueCoverflow/QueueAlbumDetail";
import { PartStage } from "./PartStage";

export const name = "Album — Sleeve";
export const note = "Album detail, sleeve variation (tracklist never default).";

export default function AlbumSleeveTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueAlbumDetail variant="sleeve" />
    </PartStage>
  );
}
