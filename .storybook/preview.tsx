import type { Preview } from "@storybook/react-vite";
import { ThemeProvider } from "../src/web/shared/theme/ThemeContext";
import "../src/web/index.css";

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="min-h-screen bg-[var(--color-bg)] p-8 text-[var(--color-text)]">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: {
    backgrounds: {
      default: "pyxis-dark",
      values: [{ name: "pyxis-dark", value: "#050505" }],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          "Atomic Design",
          ["Atoms", "Molecules", "Organisms", "Templates", "Pages"],
        ],
      },
    },
  },
};

export default preview;
