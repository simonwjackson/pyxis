import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeAlbumShelfState } from "./HomeAlbumShelfState";
import type { HomeShelfState } from "./HomeState";
import type { AlbumData } from "./types";

function HomeAlbumShelfStateStory({
  state,
}: {
  readonly state: HomeShelfState<AlbumData>;
}) {
  return (
    <div className="page-frame lattice-container max-w-5xl">
      <HomeAlbumShelfState
        state={state}
        title="Discovery"
        emptyMessage="Nothing in discovery yet. Add an album to get started."
      />
    </div>
  );
}

const meta = {
  title: "Features/Home/Album Shelf States",
  component: HomeAlbumShelfStateStory,
  tags: ["autodocs"],
} satisfies Meta<typeof HomeAlbumShelfStateStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const albums: readonly AlbumData[] = [
  {
    id: "album_1",
    title: "Night Signals",
    artist: "The Pyxis Ensemble",
    year: 2026,
    artworkUrl: null,
    placement: "discovery",
    placementUpdatedAt: 1_780_000_000_000,
    isHot: true,
    hotRank: 1,
  },
  {
    id: "album_2",
    title: "Soft Horizon",
    artist: "Zao Valley",
    year: 2024,
    artworkUrl: null,
    placement: "discovery",
    placementUpdatedAt: 1_770_000_000_000,
    isHot: false,
    hotRank: null,
  },
];

export const Loading: Story = { args: { state: { _tag: "Loading" } } };
export const Empty: Story = { args: { state: { _tag: "Ready", items: [] } } };
export const Ready: Story = {
  args: { state: { _tag: "Ready", items: albums } },
};
export const LoadError: Story = {
  args: {
    state: {
      _tag: "LoadError",
      error: { _tag: "PersistenceError", code: "read_failed" },
    },
  },
};
export const Defect: Story = {
  args: { state: { _tag: "Defect", defect: new Error("story defect") } },
};
