import type { Meta, StoryObj } from "@storybook/react-vite";
import { CollectionGridSkeleton } from "./CollectionGridSkeleton";

const meta = {
  title: "Atomic Design/Templates/CollectionGridSkeleton",
  component: CollectionGridSkeleton,
  tags: ["autodocs"],
  args: {
    title: "Discovery",
  },
} satisfies Meta<typeof CollectionGridSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AlbumShelfLoading: Story = {
  args: {
    title: "Collection",
  },
};
