import { existsSync } from "node:fs"
import { resolve } from "node:path"
import react from "@vitejs/plugin-react"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const cwd = process.cwd()
const root = existsSync(resolve(cwd, "src/main.tsx")) ? cwd : resolve(cwd, "clients/app")
const index = resolve(root, "index.html")
const serviceWorker = resolve(root, "src/pwa/service-worker.ts")

function assetManifest(): Plugin {
  return {
    name: "pyxis-asset-manifest",
    generateBundle(_options, bundle) {
      const built = Object.values(bundle)
        .map((entry) => `/${entry.fileName}`)
        .filter((file) => file !== "/service-worker.js" && file !== "/asset-manifest.json")
      const assets = [...new Set(["/", "/manifest.webmanifest", "/icons/pyxis.svg", ...built])]
      const worker = bundle["service-worker.js"]
      if (worker === undefined || worker.type !== "chunk") {
        throw new Error("service-worker.js was not emitted")
      }
      const placeholder = "__PYXIS_ASSET_MANIFEST__"
      if (!worker.code.includes(placeholder)) {
        throw new Error("service worker asset placeholder was not preserved")
      }
      const encoded = JSON.stringify(assets).replaceAll("\\", "\\\\").replaceAll('"', '\\"')
      worker.code = worker.code.replace(placeholder, encoded)
      this.emitFile({
        type: "asset",
        fileName: "asset-manifest.json",
        source: JSON.stringify({ assets }, null, 2),
      })
    },
  }
}

export default defineConfig({
  root,
  plugins: [react(), assetManifest()],
  // ProseQL schemas are matched by class identity, so a second copy of Effect would make
  // the engine fail to recognise the schemas this client hands it.
  resolve: { dedupe: ["effect"] },
  build: {
    rollupOptions: {
      input: { index, "service-worker": serviceWorker },
      output: {
        entryFileNames: (entry) =>
          entry.name === "service-worker" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/rpc": "http://127.0.0.1:4488",
      "/stream": "http://127.0.0.1:4488",
      "/healthz": "http://127.0.0.1:4488",
      "/realtime": { target: "ws://127.0.0.1:4488", ws: true },
    },
  },
  test: {
    environment: "jsdom",
  },
})
