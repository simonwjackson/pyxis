import type { SearchAlbum } from "../types";
import { SearchAlbumRow } from "./SearchAlbumRow";
import { SearchSectionHeader } from "./SearchSectionHeader";

type SearchAlbumsProps = {
  readonly albums: readonly SearchAlbum[];
  readonly onPlayAlbum?: (albumId: string) => void;
  readonly playingAlbumId?: string | null;
  readonly onSaveAlbum?: (albumId: string) => void;
};

export function SearchAlbums({
  albums,
  onPlayAlbum,
  playingAlbumId,
  onSaveAlbum,
}: SearchAlbumsProps) {
  if (albums.length === 0) return null;

  return (
    <section>
      <SearchSectionHeader>albums</SearchSectionHeader>
      <div className="space-y-1">
        {albums.map((album) => (
          <SearchAlbumRow
            key={album.id}
            album={album}
            isLoadingPlay={playingAlbumId === album.id}
            onPlayAlbum={onPlayAlbum}
            onSaveAlbum={onSaveAlbum}
          />
        ))}
      </div>
    </section>
  );
}
