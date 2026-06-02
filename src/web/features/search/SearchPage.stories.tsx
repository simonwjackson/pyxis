import type { ApiSearchTrack } from "@shared/api/contracts/search";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchEmptyState } from "./components/SearchEmptyState";
import { SearchFailureState } from "./components/SearchFailureState";
import { SearchIdleState } from "./components/SearchIdleState";
import { SearchLoadingState } from "./components/SearchLoadingState";
import { SearchResultsState } from "./components/SearchResultsState";
import { SearchPageProvider } from "./SearchPage.context";
import type { SearchState } from "./SearchState";

function SearchStateStory({ state }: { readonly state: SearchState }) {
  return (
    <div className="page-frame lattice-container space-y-6 max-w-4xl">
      <SearchPageProvider
        value={{
          state,
          playingAlbumId: null,
          playAlbum: () => undefined,
          saveAlbum: () => undefined,
          startRadio: () => undefined,
          createStation: () => undefined,
        }}
      >
        <SearchIdleState />
        <SearchLoadingState />
        <SearchEmptyState />
        <SearchFailureState />
        <SearchResultsState />
      </SearchPageProvider>
    </div>
  );
}

const meta = {
  title: "Features/Search/Page States",
  component: SearchStateStory,
  tags: ["autodocs"],
} satisfies Meta<typeof SearchStateStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const track: ApiSearchTrack = {
  id: "ytmusic:track-1",
  title: "Cerulean Orbit",
  artist: "The Pyxis Ensemble",
  album: "Night Signals",
  duration: 241,
  capabilities: {
    feedback: false,
    sleep: false,
    bookmark: false,
    explain: false,
    radio: true,
  },
};

const resultsState: SearchState = {
  _tag: "Results",
  results: {
    tracks: [track],
    albums: [
      {
        id: "ytmusic:album-1",
        title: "Night Signals",
        artist: "The Pyxis Ensemble",
        sourceIds: ["ytmusic:album-1"],
        year: 2026,
        artworkUrl: null,
        state: {
          _tag: "InLibrary",
          albumId: "album_1",
          placement: "discovery",
          isHot: true,
        },
      },
    ],
    pandoraArtists: [
      {
        musicToken: "artist-token-1",
        artistName: "The Pyxis Ensemble",
        score: 98,
      },
    ],
    pandoraGenres: [
      {
        musicToken: "genre-token-1",
        stationName: "Luminous Downtempo",
        score: 88,
      },
    ],
  },
};

export const Idle: Story = { args: { state: { _tag: "Idle" } } };
export const Loading: Story = { args: { state: { _tag: "Loading" } } };
export const Empty: Story = { args: { state: { _tag: "Empty" } } };
export const Results: Story = { args: { state: resultsState } };
export const LoadError: Story = {
  args: {
    state: {
      _tag: "LoadError",
      error: { _tag: "SourceUnavailable", source: "ytmusic", code: "offline" },
    },
  },
};
export const Defect: Story = {
  args: { state: { _tag: "Defect", defect: new Error("story defect") } },
};
