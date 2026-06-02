import { useSearchPage } from "../SearchPage.context";
import { SearchResultsRoot } from "../SearchResultsRoot";
import { SearchAlbums } from "./SearchAlbums";
import { SearchArtists } from "./SearchArtists";
import { SearchGenres } from "./SearchGenres";
import { SearchTracks } from "./SearchTracks";

export function SearchResultsState() {
  const {
    state,
    playingAlbumId,
    playAlbum,
    saveAlbum,
    startRadio,
    createStation,
  } = useSearchPage();
  if (state._tag !== "Results") return null;

  return (
    <SearchResultsRoot>
      <SearchAlbums
        albums={state.results.albums}
        onPlayAlbum={playAlbum}
        playingAlbumId={playingAlbumId}
        onSaveAlbum={saveAlbum}
      />
      <SearchTracks tracks={state.results.tracks} onStartRadio={startRadio} />
      <SearchArtists
        artists={state.results.pandoraArtists}
        onCreateStation={createStation}
      />
      <SearchGenres
        genres={state.results.pandoraGenres}
        onCreateStation={createStation}
      />
    </SearchResultsRoot>
  );
}
