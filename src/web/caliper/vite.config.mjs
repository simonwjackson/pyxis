import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineCaliperViteConfig } from "@simonwjackson/caliper/vite";

const caliperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(caliperDir, "../../..");
const config = defineCaliperViteConfig({
  repoRoot,
  aliases: {
    "pyxis-caliper-runtime": "@simonwjackson/caliper",
    "@app": path.resolve(repoRoot, "src/web"),
    "@server": path.resolve(repoRoot, "server"),
    "@shared/api": path.resolve(repoRoot, "src/api"),
    "@shared/sources": path.resolve(repoRoot, "src/sources"),
    "@shared/db": path.resolve(repoRoot, "src/db"),
    "@shared/config": path.resolve(repoRoot, "src/config"),
    "@shared/logger": path.resolve(repoRoot, "src/logger"),
  },
  server: {
    port: 3131,
    allowedHosts: true,
    watch: {
      ignored: ["**/.direnv/**"],
    },
  },
});

export default {
  ...config,
  root: caliperDir,
  plugins: [...(config.plugins ?? []), tailwindcss()],
};
