import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TrackInfoState } from "./TrackInfoState";
import { TrackInfoTraitsProvider } from "./TrackInfoTraits.context";
import { TrackInfoTraitsEmptyState } from "./TrackInfoTraitsEmptyState";
import { TrackInfoTraitsFailureState } from "./TrackInfoTraitsFailureState";
import { TrackInfoTraitsLoadingState } from "./TrackInfoTraitsLoadingState";
import { TrackInfoTraitsReadyState } from "./TrackInfoTraitsReadyState";

function TrackInfoTraitsStateStory({
  state,
}: {
  readonly state: TrackInfoState;
}) {
  return (
    <div className="max-w-md bg-pyxis-bg p-6">
      <h3 className="text-sm font-medium text-pyxis-muted uppercase tracking-wide mb-3">
        Music Genome Traits
      </h3>
      <TrackInfoTraitsProvider value={{ state }}>
        <TrackInfoTraitsLoadingState />
        <TrackInfoTraitsFailureState />
        <TrackInfoTraitsEmptyState />
        <TrackInfoTraitsReadyState />
      </TrackInfoTraitsProvider>
    </div>
  );
}

const meta = {
  title: "Shared/Track Info/Traits States",
  component: TrackInfoTraitsStateStory,
  tags: ["autodocs"],
} satisfies Meta<typeof TrackInfoTraitsStateStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { args: { state: { _tag: "Loading" } } };
export const Empty: Story = { args: { state: { _tag: "Empty" } } };
export const Ready: Story = {
  args: {
    state: {
      _tag: "Ready",
      traits: [
        { traitId: "syncopation", traitName: "Syncopated rhythm" },
        { traitId: "warm-synths", traitName: "Warm synthesizer textures" },
        { traitId: "minor-key", traitName: "Minor key tonality" },
      ],
    },
  },
};
export const LoadError: Story = { args: { state: { _tag: "LoadError" } } };
export const Defect: Story = { args: { state: { _tag: "Defect" } } };
