import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineCaliperViteConfig } from "@simonwjackson/caliper/vite";

const caliperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(caliperDir, "../../..");

// The Caliper package is linked (bun link) and lives outside repoRoot, so its
// vendored font files under node_modules are outside Vite's default fs.allow.
// Resolve its real path and allow it so the lab can serve Caliper's assets.
let caliperPkgDir;
try {
  caliperPkgDir = fs.realpathSync(
    path.join(repoRoot, "node_modules/@simonwjackson/caliper"),
  );
} catch {
  caliperPkgDir = path.resolve(repoRoot, "../caliper");
}
const pyxisCaliperNoAiPartsPlugin = {
  name: "pyxis-caliper-no-ai-parts",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/__lab/ai-parts/")) {
        next();
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ parts: [] }));
    });
  },
};

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
  server: {
    ...(config.server ?? {}),
    fs: {
      allow: [repoRoot, caliperPkgDir],
    },
  },
  plugins: [
    pyxisCaliperNoAiPartsPlugin,
    ...(config.plugins ?? []),
    tailwindcss(),
  ],
};
