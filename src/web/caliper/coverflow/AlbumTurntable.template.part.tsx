import { QueueAlbumDetail } from "@app/features/sandbox/QueueCoverflow/QueueAlbumDetail";
import { PartStage } from "./PartStage";

export const name = "Album — Turntable";
export const note =
  "Album detail, turntable variation (tracklist never default).";

export default function AlbumTurntableTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueAlbumDetail variant="turntable" />
    </PartStage>
  );
}
