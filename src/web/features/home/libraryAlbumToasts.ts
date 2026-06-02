import { formatPlacementLabel } from "@app/shared/lib/libraryPlacement";
import { toast } from "sonner";
import type { ApiSaveAlbumResult } from "../../../api/contracts/library.js";

export function toastAlbumSaveResult(result: ApiSaveAlbumResult): void {
  switch (result.outcome) {
    case "created":
      toast.success("album added to discovery");
      break;
    case "restored":
      toast.success("album restored to discovery");
      break;
    case "existing":
      toast.info(
        `album already in ${formatPlacementLabel(result.placement).toLowerCase()}`,
      );
      break;
  }
}
