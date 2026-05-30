import type { StorybookConfig } from "@storybook/react-vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) =>
    mergeConfig(config, {
      resolve: {
        alias: {
          "@app": path.resolve(dirname, "../src/web"),
          "@server": path.resolve(dirname, "../server"),
          "@shared/api": path.resolve(dirname, "../src/api"),
          "@shared/config": path.resolve(dirname, "../src/config.ts"),
          "@shared/db": path.resolve(dirname, "../src/db"),
          "@shared/logger": path.resolve(dirname, "../src/logger.ts"),
          "@shared/sources": path.resolve(dirname, "../src/sources"),
        },
      },
    }),
};

export default config;
