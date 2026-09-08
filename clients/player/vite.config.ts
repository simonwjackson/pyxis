import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))
const index = fileURLToPath(new URL("./index.html", import.meta.url))
// The service worker is the reference client's, not a second copy of it. It authorises media
// streams, and the authorisation scheme is subtle enough that maintaining two of them would
// guarantee they drift. The player already reuses the same worker layer through
// src/main.tsx, so this is the established seam rather than a new one.
const serviceWorker = fileURLToPath(new URL("../app/src/pwa/service-worker.ts", import.meta.url))

// Files under public/ never enter the bundle, so anything the shell needs offline has to be
// named here or the service worker will not precache it. cache.addAll rejects atomically, so
// a path listed here that is not actually served fails the install and leaves the worker
// inactive -- which silently means no stream authorisation at all.
const SHELL_FILES = [
  "/",
  "/manifest.webmanifest",
  "/icons/pyxis.svg",
  "/icons/pyxis-maskable.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
]

function assetManifest(): Plugin {
  return {
    name: "pyxis-player-asset-manifest",
    generateBundle(_options, bundle) {
      const built = Object.values(bundle)
        .map((entry) => `/${entry.fileName}`)
        .filter((file) => file !== "/service-worker.js" && file !== "/asset-manifest.json")
      const assets = [...new Set([...SHELL_FILES, ...built])]
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
  // ProseQL schemas are matched by class identity, so a second copy of Effect would make the
  // engine fail to recognise the schemas this client hands it. The player reaches the same
  // engine through the shared worker layer and needs the same guarantee.
  resolve: { dedupe: ["effect"] },
  build: {
    rollupOptions: {
      input: { index, "service-worker": serviceWorker },
      output: {
        // The worker must land at the root. A service worker can only control pages within
        // its own path, so emitting it under /assets/ would leave it controlling nothing and
        // every stream request unauthorised.
        entryFileNames: (entry) =>
          entry.name === "service-worker" ? "service-worker.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    proxy: {
      "/rpc": "http://127.0.0.1:4488",
      "/stream": "http://127.0.0.1:4488",
      "/healthz": "http://127.0.0.1:4488",
      "/realtime": { target: "ws://127.0.0.1:4488", ws: true },
    },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.tsx"] },
})
