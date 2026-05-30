import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./Skeleton";
import { Spinner } from "./Spinner";

const meta = {
  title: "Atomic Design/Molecules/Feedback",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Fixture-backed loading primitives used by Pyxis pages and templates.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingPrimitives: Story = {
  render: () => (
    <div className="grid max-w-lg gap-6">
      <div className="flex items-center gap-3">
        <Spinner />
        <span className="zune-label text-pyxis-muted">syncing library</span>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  ),
};
