import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta = {
  title: "Atomic Design/Atoms/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "play",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "ghost", "outline", "destructive"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button>default</Button>
      <Button variant="ghost">ghost</Button>
      <Button variant="outline">outline</Button>
      <Button variant="destructive">destructive</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">small</Button>
      <Button>default</Button>
      <Button size="lg">large</Button>
      <Button size="icon" aria-label="Icon button">
        +
      </Button>
    </div>
  ),
};
