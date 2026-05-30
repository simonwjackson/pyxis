import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./Input";

const meta = {
  title: "Atomic Design/Atoms/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "search albums, artists, stations…",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <div className="grid max-w-md gap-4">
      <Input placeholder="default" />
      <Input value="filled value" readOnly />
      <Input placeholder="disabled" disabled />
    </div>
  ),
};
